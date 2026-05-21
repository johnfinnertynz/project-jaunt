#!/usr/bin/env python3
"""Build the local NZ Change Map database and export the static frontend data.

The app is hosted on GitHub Pages, so the browser cannot read SQLite directly.
This pipeline keeps the source-of-truth locally in SQLite, then exports the
small JavaScript payload used by docs/nz-change-map.

Current adapters are source-aware seed pipelines. They preserve source metadata,
target URLs, and update notes so each dataset can be replaced with a live parser
without changing the frontend contract.
"""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "nz-change-map" / "nz-change-map.sqlite"
EXPORT_PATH = ROOT / "docs" / "nz-change-map" / "data.js"
BOUNDARY_SERVICE_URL = "https://services.arcgis.com/XTtANUDT8Va4DLwI/arcgis/rest/services/Regional_Council_Boundary/FeatureServer/0/query"
BOUNDARY_SOURCE_URL = "https://datafinder.stats.govt.nz/layer/111182-regional-council-2023-generalised/"
BOUNDARY_SIMPLIFY_TOLERANCE = 0.0025

YEARS = [2000, 2005, 2010, 2015, 2020, 2025]

FALLBACK_REGIONS = [
    {
        "id": "northland",
        "name": "Northland",
        "coords": [-35.725, 174.323],
        "shape": [[-34.42, 172.68], [-34.05, 173.35], [-34.32, 174.42], [-35.0, 175.02], [-35.72, 174.82], [-36.28, 174.22], [-36.05, 173.24], [-35.18, 172.72]],
    },
    {
        "id": "auckland",
        "name": "Auckland",
        "coords": [-36.848, 174.763],
        "shape": [[-36.22, 174.08], [-36.15, 174.88], [-36.58, 175.35], [-37.18, 175.12], [-37.32, 174.48], [-36.88, 173.98]],
    },
    {
        "id": "waikato",
        "name": "Waikato",
        "coords": [-37.787, 175.279],
        "shape": [[-37.08, 174.18], [-37.12, 175.28], [-37.55, 176.12], [-38.32, 176.02], [-38.78, 175.18], [-38.62, 174.42], [-37.82, 174.0]],
    },
    {
        "id": "bay-of-plenty",
        "name": "Bay of Plenty",
        "coords": [-37.687, 176.166],
        "shape": [[-37.12, 175.28], [-37.22, 176.08], [-37.56, 177.18], [-38.12, 177.52], [-38.32, 176.02], [-37.55, 176.12]],
    },
    {
        "id": "hawkes-bay",
        "name": "Hawke's Bay",
        "coords": [-39.492, 176.912],
        "shape": [[-38.32, 176.02], [-38.12, 177.52], [-39.0, 178.04], [-40.08, 177.24], [-40.02, 176.18], [-39.12, 175.78]],
    },
    {
        "id": "wellington",
        "name": "Wellington",
        "coords": [-41.286, 174.776],
        "shape": [[-40.02, 175.12], [-40.02, 176.18], [-40.72, 176.42], [-41.42, 175.42], [-41.6, 174.62], [-40.92, 174.28]],
    },
    {
        "id": "tasman-nelson",
        "name": "Tasman / Nelson",
        "coords": [-41.276, 173.284],
        "shape": [[-40.58, 172.5], [-40.72, 173.72], [-41.42, 174.18], [-42.18, 173.72], [-42.5, 172.64], [-41.82, 171.82]],
    },
    {
        "id": "canterbury",
        "name": "Canterbury",
        "coords": [-43.532, 172.636],
        "shape": [[-42.12, 171.58], [-42.22, 173.72], [-43.42, 174.0], [-44.78, 171.78], [-44.48, 169.98], [-43.24, 170.32]],
    },
    {
        "id": "otago",
        "name": "Otago",
        "coords": [-45.878, 170.503],
        "shape": [[-44.48, 169.98], [-44.78, 171.78], [-45.74, 171.18], [-46.28, 169.72], [-45.62, 168.52], [-44.82, 168.82]],
    },
    {
        "id": "southland",
        "name": "Southland",
        "coords": [-46.413, 168.353],
        "shape": [[-45.62, 168.52], [-46.28, 169.72], [-46.78, 168.94], [-46.68, 167.54], [-45.92, 166.86], [-45.28, 167.72]],
    },
]


@dataclass(frozen=True)
class Dataset:
    id: str
    label: str
    short_label: str
    unit: str
    metric_label: str
    summary: str
    source: str
    source_url: str
    low_label: str
    high_label: str
    pipeline: str
    invert_good: bool = False
    inflation_adjustable: bool = False


DATASETS = [
    Dataset(
        id="affordability",
        label="Land affordability",
        short_label="Affordability",
        unit="price-to-income",
        metric_label="Median land/home price to income",
        summary="Compare how hard buying land or housing feels across regions. The inflation switch shows a real-terms affordability index for the selected year.",
        source="MHUD local housing statistics, RBNZ housing indicators, Stats NZ CPI",
        source_url="https://www.hud.govt.nz/stats-and-insights/local-housing-statistics",
        low_label="More affordable",
        high_label="Less affordable",
        pipeline="housing_affordability",
        inflation_adjustable=True,
    ),
    Dataset(
        id="population",
        label="Population density",
        short_label="Population",
        unit="people/km2",
        metric_label="Regional population density",
        summary="See where population pressure is concentrating over time, with census and estimated-resident-population data as the target pipeline.",
        source="Stats NZ census and population estimates",
        source_url="https://portal.apis.stats.govt.nz/",
        low_label="Sparse",
        high_label="Dense",
        pipeline="stats_nz_population",
    ),
    Dataset(
        id="fibre",
        label="Internet rollout",
        short_label="Fibre",
        unit="% premises",
        metric_label="Fibre-capable coverage",
        summary="Track the spread of fibre-capable broadband through urban centres and later expansion areas.",
        source="Crown Infrastructure Partners / national broadband rollout reporting",
        source_url="https://www.nationalinfrastructure.govt.nz/",
        low_label="Low coverage",
        high_label="High coverage",
        pipeline="broadband_rollout",
        invert_good=True,
    ),
    Dataset(
        id="cellTowers",
        label="Cell phone towers",
        short_label="Cell towers",
        unit="sites index",
        metric_label="Cell site density index",
        summary="Show mobile infrastructure concentration using RSM licence records and open cell-site databases as the target source layer.",
        source="RSM Register of Radio Frequencies and NZ cell-site datasets",
        source_url="https://portal.api.business.govt.nz/api/radiospectrum-management",
        low_label="Fewer sites",
        high_label="More sites",
        pipeline="rsm_cell_sites",
    ),
    Dataset(
        id="work",
        label="Where people work",
        short_label="Work",
        unit="commuter inflow",
        metric_label="Workplace concentration index",
        summary="Explore where employment concentrates compared with where people live, using census workplace and commuting tables.",
        source="Stats NZ census workplace address and commuting data",
        source_url="https://www.stats.govt.nz/tools/2018-census-place-summaries/",
        low_label="Localised",
        high_label="Job hub",
        pipeline="stats_nz_workplace",
    ),
    Dataset(
        id="farmland",
        label="Farmland and crops",
        short_label="Farmland",
        unit="% land",
        metric_label="Pasture and crop land-cover share",
        summary="Track changes in productive land cover, including intensification, urban edge pressure, forestry conversion, and crop changes.",
        source="New Zealand Land Cover Database and Stats NZ agricultural production",
        source_url="https://nedc.nz/content/new-zealand-land-cover-database/",
        low_label="Lower share",
        high_label="Higher share",
        pipeline="land_cover_database",
    ),
    Dataset(
        id="forestry",
        label="Forestry cover",
        short_label="Forestry",
        unit="% forest",
        metric_label="Forest, plantation, and woodlot cover",
        summary="Track how indigenous forest, planted production forest, harvesting cycles, and farm-to-forest conversion change the regional landscape over time.",
        source="MPI National Exotic Forest Description and New Zealand Land Cover Database",
        source_url="https://www.mpi.govt.nz/forestry/forest-industry-and-workforce/forestry-wood-processing-data/new-zealand-forest-data",
        low_label="Lower cover",
        high_label="Higher cover",
        pipeline="forestry_cover",
    ),
    Dataset(
        id="climatePressure",
        label="Climate pressure",
        short_label="Climate",
        unit="risk index",
        metric_label="Flood, heat, and exposure index",
        summary="A future composite layer for coastal exposure, flood plains, drought risk, heat stress, and observed extreme-weather impacts.",
        source="MfE environmental reporting, NIWA climate layers, council hazard datasets",
        source_url="https://environment.govt.nz/facts-and-science/",
        low_label="Lower pressure",
        high_label="Higher pressure",
        pipeline="climate_pressure",
    ),
    Dataset(
        id="politics",
        label="Political position",
        short_label="Politics",
        unit="index",
        metric_label="Regional party-vote position index",
        summary="Map how regional political balance changes over time. The production layer would use Electoral Commission party-vote results by electorate and map them to regions.",
        source="Electoral Commission election results by electorate and party vote",
        source_url="https://electionresults.govt.nz/",
        low_label="Centre-left",
        high_label="Centre-right",
        pipeline="electoral_commission_results",
    ),
]

SOURCES = [
    {
        "id": "stats_nz_boundaries",
        "name": "Regional Council 2023 generalised boundaries",
        "owner": "Stats NZ Geographic Data Service",
        "url": BOUNDARY_SOURCE_URL,
        "notes": "Official regional council boundaries, generalised for rapid thematic web mapping.",
    },
    {
        "id": "mhud_housing",
        "name": "MHUD Local Housing Statistics",
        "owner": "Ministry of Housing and Urban Development",
        "url": "https://www.hud.govt.nz/stats-and-insights/local-housing-statistics",
        "notes": "Housing and rental indicators for local housing markets.",
    },
    {
        "id": "rbnz_housing",
        "name": "RBNZ housing indicators",
        "owner": "Reserve Bank of New Zealand",
        "url": "https://www.rbnz.govt.nz/statistics",
        "notes": "Housing and financial indicators useful for affordability context.",
    },
    {
        "id": "stats_nz",
        "name": "Stats NZ APIs and census tables",
        "owner": "Stats NZ",
        "url": "https://portal.apis.stats.govt.nz/",
        "notes": "Population, CPI, census workplace, commuting, and agriculture tables.",
    },
    {
        "id": "broadband_rollout",
        "name": "National broadband rollout reporting",
        "owner": "Crown Infrastructure Partners / National Infrastructure",
        "url": "https://www.nationalinfrastructure.govt.nz/",
        "notes": "Fibre and broadband rollout reporting by coverage area.",
    },
    {
        "id": "rsm_register",
        "name": "Radio Spectrum Management API",
        "owner": "MBIE Radio Spectrum Management",
        "url": "https://portal.api.business.govt.nz/api/radiospectrum-management",
        "notes": "Radio licence records for mobile infrastructure aggregation.",
    },
    {
        "id": "lcdb",
        "name": "New Zealand Land Cover Database",
        "owner": "Manaaki Whenua Landcare Research",
        "url": "https://nedc.nz/content/new-zealand-land-cover-database/",
        "notes": "Land-cover snapshots suitable for productive land change analysis.",
    },
    {
        "id": "mpi_nefd",
        "name": "National Exotic Forest Description",
        "owner": "Ministry for Primary Industries",
        "url": "https://www.mpi.govt.nz/forestry/forest-industry-and-workforce/forestry-wood-processing-data/new-zealand-forest-data",
        "notes": "Regional production-forest area, age-class, planting, and harvesting statistics.",
    },
    {
        "id": "mfe_environment",
        "name": "MfE environmental reporting",
        "owner": "Ministry for the Environment",
        "url": "https://environment.govt.nz/facts-and-science/",
        "notes": "Environmental indicators and context for climate-pressure layers.",
    },
    {
        "id": "electoral_commission",
        "name": "Election results",
        "owner": "Electoral Commission",
        "url": "https://electionresults.govt.nz/",
        "notes": "Party vote and electorate results for political-position mapping.",
    },
]

DATASET_SOURCES = {
    "affordability": ["mhud_housing", "rbnz_housing", "stats_nz"],
    "population": ["stats_nz"],
    "fibre": ["broadband_rollout"],
    "cellTowers": ["rsm_register"],
    "work": ["stats_nz"],
    "farmland": ["lcdb", "stats_nz"],
    "forestry": ["mpi_nefd", "lcdb"],
    "climatePressure": ["mfe_environment"],
    "politics": ["electoral_commission"],
}


SEED_SERIES = {
    "affordability": {
        "northland": [3.1, 3.5, 4.7, 6.0, 7.2, 6.4],
        "auckland": [4.6, 5.7, 7.8, 10.3, 11.5, 9.4],
        "waikato": [3.3, 3.8, 5.1, 6.8, 8.2, 7.0],
        "bay-of-plenty": [3.6, 4.2, 5.6, 7.6, 9.1, 7.8],
        "gisborne": [2.8, 3.2, 4.2, 5.8, 7.4, 6.7],
        "hawkes-bay": [2.9, 3.3, 4.4, 5.9, 7.5, 6.6],
        "taranaki": [2.7, 3.0, 3.9, 5.0, 6.2, 5.6],
        "manawatu-whanganui": [2.6, 2.9, 3.7, 4.8, 5.8, 5.2],
        "wellington": [4.0, 4.8, 6.2, 7.7, 9.6, 7.9],
        "west-coast": [2.1, 2.4, 3.0, 3.8, 4.7, 4.3],
        "tasman": [3.5, 4.1, 5.2, 6.9, 8.4, 7.3],
        "nelson": [3.9, 4.6, 5.9, 7.6, 9.0, 7.9],
        "marlborough": [3.4, 3.9, 5.0, 6.5, 7.9, 7.0],
        "canterbury": [3.4, 4.1, 5.1, 5.8, 6.7, 6.2],
        "otago": [3.0, 3.5, 4.6, 6.5, 8.6, 7.4],
        "southland": [2.2, 2.4, 3.0, 3.7, 4.6, 4.2],
    },
    "population": {
        "northland": [13, 14, 15, 16, 18, 20],
        "auckland": [210, 235, 260, 300, 340, 365],
        "waikato": [13, 15, 16, 18, 21, 23],
        "bay-of-plenty": [18, 20, 22, 25, 30, 33],
        "gisborne": [6, 6.2, 6.5, 6.9, 7.5, 8],
        "hawkes-bay": [11, 12, 13, 14, 16, 17],
        "taranaki": [15, 15, 16, 16, 17, 18],
        "manawatu-whanganui": [10, 10, 11, 11, 12, 13],
        "wellington": [60, 64, 68, 73, 79, 82],
        "west-coast": [1.5, 1.4, 1.4, 1.4, 1.4, 1.5],
        "tasman": [5, 5.3, 5.7, 6.1, 6.8, 7.3],
        "nelson": [105, 110, 116, 123, 131, 136],
        "marlborough": [4.1, 4.2, 4.4, 4.7, 5.0, 5.3],
        "canterbury": [12, 13, 14, 16, 18, 20],
        "otago": [7, 7, 8, 9, 10, 11],
        "southland": [3, 3, 3, 3.2, 3.4, 3.5],
    },
    "fibre": {
        "northland": [0, 0, 6, 34, 64, 78],
        "auckland": [0, 2, 24, 67, 86, 92],
        "waikato": [0, 1, 15, 51, 78, 88],
        "bay-of-plenty": [0, 1, 14, 49, 77, 87],
        "gisborne": [0, 0, 7, 32, 63, 76],
        "hawkes-bay": [0, 0, 12, 45, 73, 84],
        "taranaki": [0, 0, 10, 39, 70, 82],
        "manawatu-whanganui": [0, 0, 9, 37, 69, 81],
        "wellington": [0, 2, 22, 66, 87, 93],
        "west-coast": [0, 0, 4, 18, 44, 61],
        "tasman": [0, 0, 7, 34, 66, 80],
        "nelson": [0, 0, 12, 48, 78, 88],
        "marlborough": [0, 0, 7, 33, 65, 79],
        "canterbury": [0, 2, 20, 62, 84, 91],
        "otago": [0, 1, 12, 48, 75, 86],
        "southland": [0, 0, 7, 33, 63, 76],
    },
    "cellTowers": {
        "northland": [18, 24, 33, 45, 58, 68],
        "auckland": [90, 120, 165, 220, 285, 330],
        "waikato": [34, 46, 65, 88, 116, 137],
        "bay-of-plenty": [28, 38, 55, 78, 105, 125],
        "gisborne": [9, 13, 19, 28, 38, 46],
        "hawkes-bay": [20, 28, 39, 54, 70, 82],
        "taranaki": [16, 22, 31, 43, 57, 67],
        "manawatu-whanganui": [22, 30, 42, 58, 76, 90],
        "wellington": [58, 74, 98, 130, 168, 190],
        "west-coast": [7, 10, 14, 20, 27, 32],
        "tasman": [10, 14, 20, 28, 37, 44],
        "nelson": [12, 16, 23, 32, 42, 49],
        "marlborough": [11, 15, 22, 31, 41, 48],
        "canterbury": [52, 70, 96, 132, 178, 205],
        "otago": [26, 34, 47, 64, 85, 99],
        "southland": [12, 16, 23, 32, 42, 49],
    },
    "work": {
        "northland": [32, 34, 35, 37, 39, 40],
        "auckland": [150, 160, 173, 190, 205, 214],
        "waikato": [55, 58, 62, 70, 78, 82],
        "bay-of-plenty": [46, 50, 55, 63, 72, 78],
        "gisborne": [28, 29, 31, 34, 38, 40],
        "hawkes-bay": [35, 37, 40, 45, 50, 52],
        "taranaki": [36, 38, 40, 44, 49, 52],
        "manawatu-whanganui": [38, 40, 43, 48, 54, 57],
        "wellington": [112, 118, 126, 136, 145, 148],
        "west-coast": [18, 18, 19, 20, 22, 23],
        "tasman": [27, 29, 31, 34, 39, 41],
        "nelson": [52, 55, 58, 64, 72, 76],
        "marlborough": [29, 31, 33, 37, 42, 44],
        "canterbury": [90, 96, 104, 118, 132, 140],
        "otago": [42, 45, 49, 58, 68, 72],
        "southland": [25, 26, 27, 29, 31, 32],
    },
    "farmland": {
        "northland": [48, 47, 46, 44, 42, 41],
        "auckland": [32, 30, 28, 25, 22, 20],
        "waikato": [62, 61, 60, 58, 56, 55],
        "bay-of-plenty": [43, 42, 40, 38, 36, 35],
        "gisborne": [50, 49, 48, 46, 44, 43],
        "hawkes-bay": [55, 54, 53, 51, 49, 48],
        "taranaki": [58, 57, 56, 54, 52, 51],
        "manawatu-whanganui": [57, 56, 55, 53, 51, 50],
        "wellington": [38, 37, 35, 33, 31, 30],
        "west-coast": [18, 17, 17, 16, 15, 15],
        "tasman": [34, 33, 32, 31, 30, 29],
        "nelson": [12, 11, 10, 9, 8, 8],
        "marlborough": [38, 37, 36, 35, 34, 33],
        "canterbury": [58, 58, 57, 56, 55, 54],
        "otago": [50, 49, 48, 47, 46, 45],
        "southland": [64, 64, 63, 62, 61, 60],
    },
    "forestry": {
        "northland": [29, 30, 31, 32, 33, 34],
        "auckland": [18, 18, 18, 17, 17, 17],
        "waikato": [25, 26, 27, 28, 29, 30],
        "bay-of-plenty": [35, 36, 37, 38, 39, 40],
        "gisborne": [38, 40, 42, 45, 48, 51],
        "hawkes-bay": [23, 24, 25, 27, 29, 31],
        "taranaki": [21, 21, 22, 22, 23, 23],
        "manawatu-whanganui": [24, 25, 26, 28, 30, 32],
        "wellington": [28, 28, 29, 29, 30, 30],
        "west-coast": [74, 74, 75, 75, 76, 76],
        "tasman": [55, 55, 56, 56, 57, 57],
        "nelson": [37, 37, 38, 38, 39, 39],
        "marlborough": [26, 27, 28, 30, 32, 34],
        "canterbury": [15, 15, 16, 16, 17, 17],
        "otago": [19, 19, 20, 21, 22, 23],
        "southland": [20, 20, 21, 21, 22, 23],
    },
    "climatePressure": {
        "northland": [22, 25, 31, 38, 47, 56],
        "auckland": [26, 30, 36, 43, 52, 60],
        "waikato": [18, 21, 27, 34, 42, 50],
        "bay-of-plenty": [25, 29, 36, 44, 54, 63],
        "gisborne": [26, 31, 40, 51, 65, 73],
        "hawkes-bay": [24, 29, 37, 48, 62, 70],
        "taranaki": [20, 23, 29, 36, 45, 53],
        "manawatu-whanganui": [19, 23, 30, 38, 49, 58],
        "wellington": [20, 23, 29, 36, 45, 52],
        "west-coast": [22, 27, 35, 44, 56, 66],
        "tasman": [19, 23, 30, 38, 48, 57],
        "nelson": [21, 25, 32, 40, 50, 58],
        "marlborough": [20, 24, 31, 39, 49, 58],
        "canterbury": [19, 23, 31, 41, 53, 62],
        "otago": [17, 20, 27, 35, 45, 54],
        "southland": [14, 17, 22, 29, 37, 45],
    },
    "politics": {
        "northland": [56, 58, 62, 66, 60, 63],
        "auckland": [48, 50, 52, 55, 50, 52],
        "waikato": [58, 60, 63, 66, 61, 65],
        "bay-of-plenty": [60, 62, 65, 68, 63, 66],
        "gisborne": [49, 51, 54, 57, 51, 55],
        "hawkes-bay": [50, 52, 55, 57, 51, 54],
        "taranaki": [58, 60, 63, 66, 60, 64],
        "manawatu-whanganui": [51, 53, 56, 59, 52, 56],
        "wellington": [38, 37, 40, 42, 35, 38],
        "west-coast": [49, 50, 53, 56, 50, 53],
        "tasman": [53, 55, 59, 62, 56, 59],
        "nelson": [43, 44, 47, 49, 42, 45],
        "marlborough": [55, 57, 60, 63, 57, 60],
        "canterbury": [55, 57, 60, 63, 58, 61],
        "otago": [46, 48, 51, 53, 47, 50],
        "southland": [62, 64, 67, 70, 65, 68],
    },
}


PIPELINE_NOTES = {
    "housing_affordability": "Seeded now. Target: join MHUD local housing statistics with income data and Stats NZ CPI.",
    "stats_nz_population": "Seeded now. Target: Stats NZ API population estimates by region and census years.",
    "broadband_rollout": "Seeded now. Target: Crown Infrastructure Partners broadband rollout tables by coverage area.",
    "rsm_cell_sites": "Seeded now. Target: RSM licence/site records aggregated to regions.",
    "stats_nz_workplace": "Seeded now. Target: census workplace address and commuting flow tables.",
    "land_cover_database": "Seeded now. Target: LCDB versions grouped into productive land-cover classes.",
    "forestry_cover": "Seeded now. Target: combine MPI National Exotic Forest Description regional tables with LCDB forest classes over time.",
    "climate_pressure": "Seeded now. Target: MfE, NIWA, and council hazard layers composited by region.",
    "electoral_commission_results": "Seeded now. Target: Electoral Commission party vote by electorate mapped to regions.",
}


def boundary_query_url() -> str:
    params = {
        "where": "REGC_code <> '99'",
        "outFields": "*",
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "geojson",
    }
    return f"{BOUNDARY_SERVICE_URL}?{urllib.parse.urlencode(params)}"


def fetch_boundary_geojson() -> dict[str, Any]:
    request = urllib.request.Request(
        boundary_query_url(),
        headers={"User-Agent": "Project-Jaunt-NZ-Change-Map/1.0"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def perpendicular_distance(point: tuple[float, float], start: tuple[float, float], end: tuple[float, float]) -> float:
    x, y = point
    x1, y1 = start
    x2, y2 = end
    if x1 == x2 and y1 == y2:
        return math.hypot(x - x1, y - y1)
    numerator = abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1)
    denominator = math.hypot(y2 - y1, x2 - x1)
    return numerator / denominator


def douglas_peucker(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    if len(points) <= 2:
        return points

    start = points[0]
    end = points[-1]
    max_distance = -1.0
    index = 0
    for point_index in range(1, len(points) - 1):
        distance = perpendicular_distance(points[point_index], start, end)
        if distance > max_distance:
            max_distance = distance
            index = point_index

    if max_distance > tolerance:
        left = douglas_peucker(points[: index + 1], tolerance)
        right = douglas_peucker(points[index:], tolerance)
        return left[:-1] + right
    return [start, end]


def simplify_ring(ring: list[list[float]], tolerance: float) -> list[list[float]]:
    if len(ring) <= 8:
        return [[round(point[0], 5), round(point[1], 5)] for point in ring]

    points = [(float(point[0]), float(point[1])) for point in ring]
    if points[0] == points[-1]:
        points = points[:-1]

    anchor = points[0]
    split_index = max(
        range(1, len(points)),
        key=lambda index: math.hypot(points[index][0] - anchor[0], points[index][1] - anchor[1]),
    )
    rotated = points[split_index:] + points[:split_index] + [points[split_index]]
    simplified = douglas_peucker(rotated, tolerance)
    if simplified[0] != simplified[-1]:
        simplified.append(simplified[0])

    if len(simplified) < 5:
        simplified = rotated

    return [[round(point[0], 5), round(point[1], 5)] for point in simplified]


def simplify_geometry(geometry: dict[str, Any], tolerance: float = BOUNDARY_SIMPLIFY_TOLERANCE) -> dict[str, Any]:
    if geometry["type"] == "Polygon":
        return {
            "type": "Polygon",
            "coordinates": [simplify_ring(ring, tolerance) for ring in geometry["coordinates"]],
        }
    if geometry["type"] == "MultiPolygon":
        return {
            "type": "MultiPolygon",
            "coordinates": [
                [simplify_ring(ring, tolerance) for ring in polygon]
                for polygon in geometry["coordinates"]
            ],
        }
    raise ValueError(f"Unsupported boundary geometry type: {geometry['type']}")


def ring_area_and_centroid(ring: list[list[float]]) -> tuple[float, tuple[float, float]]:
    area = 0.0
    centroid_x = 0.0
    centroid_y = 0.0
    for index in range(len(ring) - 1):
        x1, y1 = ring[index]
        x2, y2 = ring[index + 1]
        cross = x1 * y2 - x2 * y1
        area += cross
        centroid_x += (x1 + x2) * cross
        centroid_y += (y1 + y2) * cross

    area *= 0.5
    if abs(area) < 0.000001:
        xs = [point[0] for point in ring]
        ys = [point[1] for point in ring]
        return 0.0, (sum(xs) / len(xs), sum(ys) / len(ys))

    return area, (centroid_x / (6 * area), centroid_y / (6 * area))


def geometry_label_point(geometry: dict[str, Any]) -> list[float]:
    if geometry["type"] == "Polygon":
        rings = [geometry["coordinates"][0]]
    else:
        rings = [polygon[0] for polygon in geometry["coordinates"]]

    _, centroid = max(
        (ring_area_and_centroid(ring) for ring in rings),
        key=lambda item: abs(item[0]),
    )
    lon, lat = centroid
    return [round(lat, 5), round(lon, 5)]


def region_id_from_name(name: str) -> str:
    clean = name.removesuffix(" Region").lower()
    clean = clean.replace("'", "").replace(" ", "-")
    return clean


def fallback_geometry_from_shape(shape: list[list[float]]) -> dict[str, Any]:
    coordinates = [[round(lng, 5), round(lat, 5)] for lat, lng in shape]
    if coordinates[0] != coordinates[-1]:
        coordinates.append(coordinates[0])
    return {"type": "Polygon", "coordinates": [coordinates]}


def load_regions() -> tuple[list[dict[str, Any]], str, str]:
    try:
        boundary_data = fetch_boundary_geojson()
        regions = []
        for feature in boundary_data["features"]:
            props = feature["properties"]
            name = props["REGC_name_ascii"].removesuffix(" Region")
            geometry = simplify_geometry(feature["geometry"])
            regions.append(
                {
                    "id": region_id_from_name(props["REGC_name_ascii"]),
                    "name": name,
                    "coords": geometry_label_point(geometry),
                    "geometry": geometry,
                    "land_area_sq_km": round(float(props["LAND_AREA_SQ_KM"]), 1),
                }
            )
        return (
            sorted(regions, key=lambda region: region["name"]),
            "source",
            "Loaded Stats NZ regional council boundaries and simplified them for browser rendering.",
        )
    except Exception as exc:
        print(f"Boundary fetch failed; using fallback region geometry: {exc}")
        return (
            [
                {
                    "id": region["id"],
                    "name": region["name"],
                    "coords": region["coords"],
                    "geometry": fallback_geometry_from_shape(region["shape"]),
                    "land_area_sq_km": None,
                }
                for region in FALLBACK_REGIONS
            ],
            "fallback",
            f"Stats NZ boundary fetch failed, so coarse built-in geometry was used: {exc}",
        )


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def reset_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        DROP TABLE IF EXISTS observations;
        DROP TABLE IF EXISTS pipeline_runs;
        DROP TABLE IF EXISTS dataset_sources;
        DROP TABLE IF EXISTS sources;
        DROP TABLE IF EXISTS datasets;
        DROP TABLE IF EXISTS regions;
        DROP TABLE IF EXISTS years;

        CREATE TABLE years (
          year INTEGER PRIMARY KEY
        );

        CREATE TABLE regions (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          land_area_sq_km REAL,
          shape_json TEXT NOT NULL
        );

        CREATE TABLE datasets (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          short_label TEXT NOT NULL,
          unit TEXT NOT NULL,
          metric_label TEXT NOT NULL,
          summary TEXT NOT NULL,
          source TEXT NOT NULL,
          source_url TEXT NOT NULL,
          low_label TEXT NOT NULL,
          high_label TEXT NOT NULL,
          pipeline TEXT NOT NULL,
          invert_good INTEGER NOT NULL DEFAULT 0,
          inflation_adjustable INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE sources (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          owner TEXT NOT NULL,
          url TEXT NOT NULL,
          notes TEXT NOT NULL
        );

        CREATE TABLE dataset_sources (
          dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
          source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
          PRIMARY KEY (dataset_id, source_id)
        );

        CREATE TABLE pipeline_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pipeline TEXT NOT NULL,
          source_url TEXT NOT NULL,
          mode TEXT NOT NULL,
          note TEXT NOT NULL,
          row_count INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE observations (
          dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
          region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
          year INTEGER NOT NULL REFERENCES years(year) ON DELETE CASCADE,
          value REAL NOT NULL,
          source_mode TEXT NOT NULL,
          PRIMARY KEY (dataset_id, region_id, year)
        );

        CREATE INDEX observations_dataset_year_idx ON observations(dataset_id, year);
        """
    )


def insert_reference_data(conn: sqlite3.Connection, regions: list[dict[str, Any]]) -> None:
    conn.executemany("INSERT INTO years (year) VALUES (?)", [(year,) for year in YEARS])
    conn.executemany(
        """
        INSERT INTO regions (id, name, lat, lon, land_area_sq_km, shape_json)
        VALUES (:id, :name, :lat, :lon, :land_area_sq_km, :shape_json)
        """,
        [
            {
                "id": region["id"],
                "name": region["name"],
                "lat": region["coords"][0],
                "lon": region["coords"][1],
                "land_area_sq_km": region["land_area_sq_km"],
                "shape_json": json.dumps(region["geometry"], separators=(",", ":")),
            }
            for region in regions
        ],
    )
    conn.executemany(
        """
        INSERT INTO datasets (
          id, label, short_label, unit, metric_label, summary, source,
          source_url, low_label, high_label, pipeline, invert_good,
          inflation_adjustable
        )
        VALUES (
          :id, :label, :short_label, :unit, :metric_label, :summary, :source,
          :source_url, :low_label, :high_label, :pipeline, :invert_good,
          :inflation_adjustable
        )
        """,
        [
            {
                **dataset.__dict__,
                "invert_good": int(dataset.invert_good),
                "inflation_adjustable": int(dataset.inflation_adjustable),
            }
            for dataset in DATASETS
        ],
    )
    conn.executemany(
        """
        INSERT INTO sources (id, name, owner, url, notes)
        VALUES (:id, :name, :owner, :url, :notes)
        """,
        SOURCES,
    )
    conn.executemany(
        """
        INSERT INTO dataset_sources (dataset_id, source_id)
        VALUES (?, ?)
        """,
        [
            (dataset_id, source_id)
            for dataset_id, source_ids in DATASET_SOURCES.items()
            for source_id in source_ids
        ],
    )


def run_seed_pipeline(conn: sqlite3.Connection, dataset: Dataset, region_ids: set[str]) -> int:
    rows = []
    for region_id, series in SEED_SERIES[dataset.id].items():
        if region_id not in region_ids:
            continue
        for year, value in zip(YEARS, series):
            rows.append((dataset.id, region_id, year, float(value), "seed"))

    conn.executemany(
        """
        INSERT INTO observations (dataset_id, region_id, year, value, source_mode)
        VALUES (?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.execute(
        """
        INSERT INTO pipeline_runs (pipeline, source_url, mode, note, row_count)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            dataset.pipeline,
            dataset.source_url,
            "seed",
            PIPELINE_NOTES[dataset.pipeline],
            len(rows),
        ),
    )
    return len(rows)


def build_database(db_path: Path) -> None:
    conn = connect(db_path)
    try:
        regions, boundary_mode, boundary_note = load_regions()
        region_ids = {region["id"] for region in regions}
        reset_schema(conn)
        insert_reference_data(conn, regions)
        conn.execute(
            """
            INSERT INTO pipeline_runs (pipeline, source_url, mode, note, row_count)
            VALUES (?, ?, ?, ?, ?)
            """,
            ("regional_boundaries", BOUNDARY_SOURCE_URL, boundary_mode, boundary_note, len(regions)),
        )
        for dataset in DATASETS:
            run_seed_pipeline(conn, dataset, region_ids)
        conn.commit()
    finally:
        conn.close()


def fetch_rows(conn: sqlite3.Connection, query: str, args: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
    conn.row_factory = sqlite3.Row
    return conn.execute(query, args).fetchall()


def export_frontend_data(db_path: Path, export_path: Path) -> None:
    conn = connect(db_path)
    try:
        years = [row["year"] for row in fetch_rows(conn, "SELECT year FROM years ORDER BY year")]
        regions = []
        for row in fetch_rows(conn, "SELECT * FROM regions ORDER BY rowid"):
            regions.append(
                {
                    "id": row["id"],
                    "name": row["name"],
                    "coords": [row["lat"], row["lon"]],
                    "landAreaSqKm": row["land_area_sq_km"],
                    "geometry": json.loads(row["shape_json"]),
                }
            )

        datasets: dict[str, dict[str, Any]] = {}
        for row in fetch_rows(conn, "SELECT * FROM datasets ORDER BY rowid"):
            dataset_id = row["id"]
            values = {}
            for region in regions:
                series_rows = fetch_rows(
                    conn,
                    """
                    SELECT year, value FROM observations
                    WHERE dataset_id = ? AND region_id = ?
                    ORDER BY year
                    """,
                    (dataset_id, region["id"]),
                )
                values[region["id"]] = [series_row["value"] for series_row in series_rows]

            datasets[dataset_id] = {
                "label": row["label"],
                "shortLabel": row["short_label"],
                "unit": row["unit"],
                "metricLabel": row["metric_label"],
                "summary": row["summary"],
                "source": row["source"],
                "sourceUrl": row["source_url"],
                "lowLabel": row["low_label"],
                "highLabel": row["high_label"],
                "pipeline": row["pipeline"],
                "invertGood": bool(row["invert_good"]),
                "inflationAdjustable": bool(row["inflation_adjustable"]),
                "values": values,
            }

        runs = [
            {
                "pipeline": row["pipeline"],
                "sourceUrl": row["source_url"],
                "mode": row["mode"],
                "note": row["note"],
                "rowCount": row["row_count"],
                "createdAt": row["created_at"],
            }
            for row in fetch_rows(conn, "SELECT * FROM pipeline_runs ORDER BY id")
        ]
    finally:
        conn.close()

    payload = {
        "years": years,
        "regions": regions,
        "datasets": datasets,
        "pipelineRuns": runs,
    }
    export_path.parent.mkdir(parents=True, exist_ok=True)
    export_path.write_text(
        "const NZ_CHANGE_MAP_DATA = "
        + json.dumps(payload, ensure_ascii=False, indent=2)
        + ";\n\n"
        + "const YEARS = NZ_CHANGE_MAP_DATA.years;\n"
        + "const REGIONS = NZ_CHANGE_MAP_DATA.regions;\n"
        + "const DATASETS = NZ_CHANGE_MAP_DATA.datasets;\n"
        + "const PIPELINE_RUNS = NZ_CHANGE_MAP_DATA.pipelineRuns;\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=DB_PATH)
    parser.add_argument("--export", type=Path, default=EXPORT_PATH)
    parser.add_argument("--no-export", action="store_true")
    args = parser.parse_args()

    build_database(args.db)
    if not args.no_export:
        export_frontend_data(args.db, args.export)

    print(f"Built {args.db}")
    if not args.no_export:
        print(f"Exported {args.export}")


if __name__ == "__main__":
    main()
