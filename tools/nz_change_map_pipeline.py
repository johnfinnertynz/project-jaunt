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
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "nz-change-map" / "nz-change-map.sqlite"
EXPORT_PATH = ROOT / "docs" / "nz-change-map" / "data.js"

YEARS = [2000, 2005, 2010, 2015, 2020, 2025]

REGIONS = [
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
    "climatePressure": ["mfe_environment"],
    "politics": ["electoral_commission"],
}


SEED_SERIES = {
    "affordability": {
        "northland": [3.1, 3.5, 4.7, 6.0, 7.2, 6.4],
        "auckland": [4.6, 5.7, 7.8, 10.3, 11.5, 9.4],
        "waikato": [3.3, 3.8, 5.1, 6.8, 8.2, 7.0],
        "bay-of-plenty": [3.6, 4.2, 5.6, 7.6, 9.1, 7.8],
        "hawkes-bay": [2.9, 3.3, 4.4, 5.9, 7.5, 6.6],
        "wellington": [4.0, 4.8, 6.2, 7.7, 9.6, 7.9],
        "tasman-nelson": [3.7, 4.3, 5.5, 7.2, 8.7, 7.6],
        "canterbury": [3.4, 4.1, 5.1, 5.8, 6.7, 6.2],
        "otago": [3.0, 3.5, 4.6, 6.5, 8.6, 7.4],
        "southland": [2.2, 2.4, 3.0, 3.7, 4.6, 4.2],
    },
    "population": {
        "northland": [13, 14, 15, 16, 18, 20],
        "auckland": [210, 235, 260, 300, 340, 365],
        "waikato": [13, 15, 16, 18, 21, 23],
        "bay-of-plenty": [18, 20, 22, 25, 30, 33],
        "hawkes-bay": [11, 12, 13, 14, 16, 17],
        "wellington": [60, 64, 68, 73, 79, 82],
        "tasman-nelson": [9, 10, 11, 12, 14, 15],
        "canterbury": [12, 13, 14, 16, 18, 20],
        "otago": [7, 7, 8, 9, 10, 11],
        "southland": [3, 3, 3, 3.2, 3.4, 3.5],
    },
    "fibre": {
        "northland": [0, 0, 6, 34, 64, 78],
        "auckland": [0, 2, 24, 67, 86, 92],
        "waikato": [0, 1, 15, 51, 78, 88],
        "bay-of-plenty": [0, 1, 14, 49, 77, 87],
        "hawkes-bay": [0, 0, 12, 45, 73, 84],
        "wellington": [0, 2, 22, 66, 87, 93],
        "tasman-nelson": [0, 0, 8, 38, 70, 82],
        "canterbury": [0, 2, 20, 62, 84, 91],
        "otago": [0, 1, 12, 48, 75, 86],
        "southland": [0, 0, 7, 33, 63, 76],
    },
    "cellTowers": {
        "northland": [18, 24, 33, 45, 58, 68],
        "auckland": [90, 120, 165, 220, 285, 330],
        "waikato": [34, 46, 65, 88, 116, 137],
        "bay-of-plenty": [28, 38, 55, 78, 105, 125],
        "hawkes-bay": [20, 28, 39, 54, 70, 82],
        "wellington": [58, 74, 98, 130, 168, 190],
        "tasman-nelson": [16, 22, 31, 43, 56, 65],
        "canterbury": [52, 70, 96, 132, 178, 205],
        "otago": [26, 34, 47, 64, 85, 99],
        "southland": [12, 16, 23, 32, 42, 49],
    },
    "work": {
        "northland": [32, 34, 35, 37, 39, 40],
        "auckland": [150, 160, 173, 190, 205, 214],
        "waikato": [55, 58, 62, 70, 78, 82],
        "bay-of-plenty": [46, 50, 55, 63, 72, 78],
        "hawkes-bay": [35, 37, 40, 45, 50, 52],
        "wellington": [112, 118, 126, 136, 145, 148],
        "tasman-nelson": [31, 33, 35, 39, 44, 46],
        "canterbury": [90, 96, 104, 118, 132, 140],
        "otago": [42, 45, 49, 58, 68, 72],
        "southland": [25, 26, 27, 29, 31, 32],
    },
    "farmland": {
        "northland": [48, 47, 46, 44, 42, 41],
        "auckland": [32, 30, 28, 25, 22, 20],
        "waikato": [62, 61, 60, 58, 56, 55],
        "bay-of-plenty": [43, 42, 40, 38, 36, 35],
        "hawkes-bay": [55, 54, 53, 51, 49, 48],
        "wellington": [38, 37, 35, 33, 31, 30],
        "tasman-nelson": [31, 30, 29, 28, 27, 26],
        "canterbury": [58, 58, 57, 56, 55, 54],
        "otago": [50, 49, 48, 47, 46, 45],
        "southland": [64, 64, 63, 62, 61, 60],
    },
    "climatePressure": {
        "northland": [22, 25, 31, 38, 47, 56],
        "auckland": [26, 30, 36, 43, 52, 60],
        "waikato": [18, 21, 27, 34, 42, 50],
        "bay-of-plenty": [25, 29, 36, 44, 54, 63],
        "hawkes-bay": [24, 29, 37, 48, 62, 70],
        "wellington": [20, 23, 29, 36, 45, 52],
        "tasman-nelson": [21, 25, 32, 40, 51, 60],
        "canterbury": [19, 23, 31, 41, 53, 62],
        "otago": [17, 20, 27, 35, 45, 54],
        "southland": [14, 17, 22, 29, 37, 45],
    },
    "politics": {
        "northland": [56, 58, 62, 66, 60, 63],
        "auckland": [48, 50, 52, 55, 50, 52],
        "waikato": [58, 60, 63, 66, 61, 65],
        "bay-of-plenty": [60, 62, 65, 68, 63, 66],
        "hawkes-bay": [50, 52, 55, 57, 51, 54],
        "wellington": [38, 37, 40, 42, 35, 38],
        "tasman-nelson": [48, 50, 54, 57, 51, 54],
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
    "climate_pressure": "Seeded now. Target: MfE, NIWA, and council hazard layers composited by region.",
    "electoral_commission_results": "Seeded now. Target: Electoral Commission party vote by electorate mapped to regions.",
}


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


def insert_reference_data(conn: sqlite3.Connection) -> None:
    conn.executemany("INSERT INTO years (year) VALUES (?)", [(year,) for year in YEARS])
    conn.executemany(
        """
        INSERT INTO regions (id, name, lat, lon, shape_json)
        VALUES (:id, :name, :lat, :lon, :shape_json)
        """,
        [
            {
                "id": region["id"],
                "name": region["name"],
                "lat": region["coords"][0],
                "lon": region["coords"][1],
                "shape_json": json.dumps(region["shape"], separators=(",", ":")),
            }
            for region in REGIONS
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


def run_seed_pipeline(conn: sqlite3.Connection, dataset: Dataset) -> int:
    rows = []
    for region_id, series in SEED_SERIES[dataset.id].items():
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
        reset_schema(conn)
        insert_reference_data(conn)
        for dataset in DATASETS:
            run_seed_pipeline(conn, dataset)
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
                    "shape": json.loads(row["shape_json"]),
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
