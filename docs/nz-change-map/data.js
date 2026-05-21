const NZ_CHANGE_MAP_DATA = {
  "years": [
    2000,
    2005,
    2010,
    2015,
    2020,
    2025
  ],
  "regions": [
    {
      "id": "northland",
      "name": "Northland",
      "coords": [
        -35.725,
        174.323
      ],
      "shape": [
        [
          -34.42,
          172.68
        ],
        [
          -34.05,
          173.35
        ],
        [
          -34.32,
          174.42
        ],
        [
          -35.0,
          175.02
        ],
        [
          -35.72,
          174.82
        ],
        [
          -36.28,
          174.22
        ],
        [
          -36.05,
          173.24
        ],
        [
          -35.18,
          172.72
        ]
      ]
    },
    {
      "id": "auckland",
      "name": "Auckland",
      "coords": [
        -36.848,
        174.763
      ],
      "shape": [
        [
          -36.22,
          174.08
        ],
        [
          -36.15,
          174.88
        ],
        [
          -36.58,
          175.35
        ],
        [
          -37.18,
          175.12
        ],
        [
          -37.32,
          174.48
        ],
        [
          -36.88,
          173.98
        ]
      ]
    },
    {
      "id": "waikato",
      "name": "Waikato",
      "coords": [
        -37.787,
        175.279
      ],
      "shape": [
        [
          -37.08,
          174.18
        ],
        [
          -37.12,
          175.28
        ],
        [
          -37.55,
          176.12
        ],
        [
          -38.32,
          176.02
        ],
        [
          -38.78,
          175.18
        ],
        [
          -38.62,
          174.42
        ],
        [
          -37.82,
          174.0
        ]
      ]
    },
    {
      "id": "bay-of-plenty",
      "name": "Bay of Plenty",
      "coords": [
        -37.687,
        176.166
      ],
      "shape": [
        [
          -37.12,
          175.28
        ],
        [
          -37.22,
          176.08
        ],
        [
          -37.56,
          177.18
        ],
        [
          -38.12,
          177.52
        ],
        [
          -38.32,
          176.02
        ],
        [
          -37.55,
          176.12
        ]
      ]
    },
    {
      "id": "hawkes-bay",
      "name": "Hawke's Bay",
      "coords": [
        -39.492,
        176.912
      ],
      "shape": [
        [
          -38.32,
          176.02
        ],
        [
          -38.12,
          177.52
        ],
        [
          -39.0,
          178.04
        ],
        [
          -40.08,
          177.24
        ],
        [
          -40.02,
          176.18
        ],
        [
          -39.12,
          175.78
        ]
      ]
    },
    {
      "id": "wellington",
      "name": "Wellington",
      "coords": [
        -41.286,
        174.776
      ],
      "shape": [
        [
          -40.02,
          175.12
        ],
        [
          -40.02,
          176.18
        ],
        [
          -40.72,
          176.42
        ],
        [
          -41.42,
          175.42
        ],
        [
          -41.6,
          174.62
        ],
        [
          -40.92,
          174.28
        ]
      ]
    },
    {
      "id": "tasman-nelson",
      "name": "Tasman / Nelson",
      "coords": [
        -41.276,
        173.284
      ],
      "shape": [
        [
          -40.58,
          172.5
        ],
        [
          -40.72,
          173.72
        ],
        [
          -41.42,
          174.18
        ],
        [
          -42.18,
          173.72
        ],
        [
          -42.5,
          172.64
        ],
        [
          -41.82,
          171.82
        ]
      ]
    },
    {
      "id": "canterbury",
      "name": "Canterbury",
      "coords": [
        -43.532,
        172.636
      ],
      "shape": [
        [
          -42.12,
          171.58
        ],
        [
          -42.22,
          173.72
        ],
        [
          -43.42,
          174.0
        ],
        [
          -44.78,
          171.78
        ],
        [
          -44.48,
          169.98
        ],
        [
          -43.24,
          170.32
        ]
      ]
    },
    {
      "id": "otago",
      "name": "Otago",
      "coords": [
        -45.878,
        170.503
      ],
      "shape": [
        [
          -44.48,
          169.98
        ],
        [
          -44.78,
          171.78
        ],
        [
          -45.74,
          171.18
        ],
        [
          -46.28,
          169.72
        ],
        [
          -45.62,
          168.52
        ],
        [
          -44.82,
          168.82
        ]
      ]
    },
    {
      "id": "southland",
      "name": "Southland",
      "coords": [
        -46.413,
        168.353
      ],
      "shape": [
        [
          -45.62,
          168.52
        ],
        [
          -46.28,
          169.72
        ],
        [
          -46.78,
          168.94
        ],
        [
          -46.68,
          167.54
        ],
        [
          -45.92,
          166.86
        ],
        [
          -45.28,
          167.72
        ]
      ]
    }
  ],
  "datasets": {
    "affordability": {
      "label": "Land affordability",
      "shortLabel": "Affordability",
      "unit": "price-to-income",
      "metricLabel": "Median land/home price to income",
      "summary": "Compare how hard buying land or housing feels across regions. The inflation switch shows a real-terms affordability index for the selected year.",
      "source": "MHUD local housing statistics, RBNZ housing indicators, Stats NZ CPI",
      "sourceUrl": "https://www.hud.govt.nz/stats-and-insights/local-housing-statistics",
      "lowLabel": "More affordable",
      "highLabel": "Less affordable",
      "pipeline": "housing_affordability",
      "invertGood": false,
      "inflationAdjustable": true,
      "values": {
        "northland": [
          3.1,
          3.5,
          4.7,
          6.0,
          7.2,
          6.4
        ],
        "auckland": [
          4.6,
          5.7,
          7.8,
          10.3,
          11.5,
          9.4
        ],
        "waikato": [
          3.3,
          3.8,
          5.1,
          6.8,
          8.2,
          7.0
        ],
        "bay-of-plenty": [
          3.6,
          4.2,
          5.6,
          7.6,
          9.1,
          7.8
        ],
        "hawkes-bay": [
          2.9,
          3.3,
          4.4,
          5.9,
          7.5,
          6.6
        ],
        "wellington": [
          4.0,
          4.8,
          6.2,
          7.7,
          9.6,
          7.9
        ],
        "tasman-nelson": [
          3.7,
          4.3,
          5.5,
          7.2,
          8.7,
          7.6
        ],
        "canterbury": [
          3.4,
          4.1,
          5.1,
          5.8,
          6.7,
          6.2
        ],
        "otago": [
          3.0,
          3.5,
          4.6,
          6.5,
          8.6,
          7.4
        ],
        "southland": [
          2.2,
          2.4,
          3.0,
          3.7,
          4.6,
          4.2
        ]
      }
    },
    "population": {
      "label": "Population density",
      "shortLabel": "Population",
      "unit": "people/km2",
      "metricLabel": "Regional population density",
      "summary": "See where population pressure is concentrating over time, with census and estimated-resident-population data as the target pipeline.",
      "source": "Stats NZ census and population estimates",
      "sourceUrl": "https://portal.apis.stats.govt.nz/",
      "lowLabel": "Sparse",
      "highLabel": "Dense",
      "pipeline": "stats_nz_population",
      "invertGood": false,
      "inflationAdjustable": false,
      "values": {
        "northland": [
          13.0,
          14.0,
          15.0,
          16.0,
          18.0,
          20.0
        ],
        "auckland": [
          210.0,
          235.0,
          260.0,
          300.0,
          340.0,
          365.0
        ],
        "waikato": [
          13.0,
          15.0,
          16.0,
          18.0,
          21.0,
          23.0
        ],
        "bay-of-plenty": [
          18.0,
          20.0,
          22.0,
          25.0,
          30.0,
          33.0
        ],
        "hawkes-bay": [
          11.0,
          12.0,
          13.0,
          14.0,
          16.0,
          17.0
        ],
        "wellington": [
          60.0,
          64.0,
          68.0,
          73.0,
          79.0,
          82.0
        ],
        "tasman-nelson": [
          9.0,
          10.0,
          11.0,
          12.0,
          14.0,
          15.0
        ],
        "canterbury": [
          12.0,
          13.0,
          14.0,
          16.0,
          18.0,
          20.0
        ],
        "otago": [
          7.0,
          7.0,
          8.0,
          9.0,
          10.0,
          11.0
        ],
        "southland": [
          3.0,
          3.0,
          3.0,
          3.2,
          3.4,
          3.5
        ]
      }
    },
    "fibre": {
      "label": "Internet rollout",
      "shortLabel": "Fibre",
      "unit": "% premises",
      "metricLabel": "Fibre-capable coverage",
      "summary": "Track the spread of fibre-capable broadband through urban centres and later expansion areas.",
      "source": "Crown Infrastructure Partners / national broadband rollout reporting",
      "sourceUrl": "https://www.nationalinfrastructure.govt.nz/",
      "lowLabel": "Low coverage",
      "highLabel": "High coverage",
      "pipeline": "broadband_rollout",
      "invertGood": true,
      "inflationAdjustable": false,
      "values": {
        "northland": [
          0.0,
          0.0,
          6.0,
          34.0,
          64.0,
          78.0
        ],
        "auckland": [
          0.0,
          2.0,
          24.0,
          67.0,
          86.0,
          92.0
        ],
        "waikato": [
          0.0,
          1.0,
          15.0,
          51.0,
          78.0,
          88.0
        ],
        "bay-of-plenty": [
          0.0,
          1.0,
          14.0,
          49.0,
          77.0,
          87.0
        ],
        "hawkes-bay": [
          0.0,
          0.0,
          12.0,
          45.0,
          73.0,
          84.0
        ],
        "wellington": [
          0.0,
          2.0,
          22.0,
          66.0,
          87.0,
          93.0
        ],
        "tasman-nelson": [
          0.0,
          0.0,
          8.0,
          38.0,
          70.0,
          82.0
        ],
        "canterbury": [
          0.0,
          2.0,
          20.0,
          62.0,
          84.0,
          91.0
        ],
        "otago": [
          0.0,
          1.0,
          12.0,
          48.0,
          75.0,
          86.0
        ],
        "southland": [
          0.0,
          0.0,
          7.0,
          33.0,
          63.0,
          76.0
        ]
      }
    },
    "cellTowers": {
      "label": "Cell phone towers",
      "shortLabel": "Cell towers",
      "unit": "sites index",
      "metricLabel": "Cell site density index",
      "summary": "Show mobile infrastructure concentration using RSM licence records and open cell-site databases as the target source layer.",
      "source": "RSM Register of Radio Frequencies and NZ cell-site datasets",
      "sourceUrl": "https://portal.api.business.govt.nz/api/radiospectrum-management",
      "lowLabel": "Fewer sites",
      "highLabel": "More sites",
      "pipeline": "rsm_cell_sites",
      "invertGood": false,
      "inflationAdjustable": false,
      "values": {
        "northland": [
          18.0,
          24.0,
          33.0,
          45.0,
          58.0,
          68.0
        ],
        "auckland": [
          90.0,
          120.0,
          165.0,
          220.0,
          285.0,
          330.0
        ],
        "waikato": [
          34.0,
          46.0,
          65.0,
          88.0,
          116.0,
          137.0
        ],
        "bay-of-plenty": [
          28.0,
          38.0,
          55.0,
          78.0,
          105.0,
          125.0
        ],
        "hawkes-bay": [
          20.0,
          28.0,
          39.0,
          54.0,
          70.0,
          82.0
        ],
        "wellington": [
          58.0,
          74.0,
          98.0,
          130.0,
          168.0,
          190.0
        ],
        "tasman-nelson": [
          16.0,
          22.0,
          31.0,
          43.0,
          56.0,
          65.0
        ],
        "canterbury": [
          52.0,
          70.0,
          96.0,
          132.0,
          178.0,
          205.0
        ],
        "otago": [
          26.0,
          34.0,
          47.0,
          64.0,
          85.0,
          99.0
        ],
        "southland": [
          12.0,
          16.0,
          23.0,
          32.0,
          42.0,
          49.0
        ]
      }
    },
    "work": {
      "label": "Where people work",
      "shortLabel": "Work",
      "unit": "commuter inflow",
      "metricLabel": "Workplace concentration index",
      "summary": "Explore where employment concentrates compared with where people live, using census workplace and commuting tables.",
      "source": "Stats NZ census workplace address and commuting data",
      "sourceUrl": "https://www.stats.govt.nz/tools/2018-census-place-summaries/",
      "lowLabel": "Localised",
      "highLabel": "Job hub",
      "pipeline": "stats_nz_workplace",
      "invertGood": false,
      "inflationAdjustable": false,
      "values": {
        "northland": [
          32.0,
          34.0,
          35.0,
          37.0,
          39.0,
          40.0
        ],
        "auckland": [
          150.0,
          160.0,
          173.0,
          190.0,
          205.0,
          214.0
        ],
        "waikato": [
          55.0,
          58.0,
          62.0,
          70.0,
          78.0,
          82.0
        ],
        "bay-of-plenty": [
          46.0,
          50.0,
          55.0,
          63.0,
          72.0,
          78.0
        ],
        "hawkes-bay": [
          35.0,
          37.0,
          40.0,
          45.0,
          50.0,
          52.0
        ],
        "wellington": [
          112.0,
          118.0,
          126.0,
          136.0,
          145.0,
          148.0
        ],
        "tasman-nelson": [
          31.0,
          33.0,
          35.0,
          39.0,
          44.0,
          46.0
        ],
        "canterbury": [
          90.0,
          96.0,
          104.0,
          118.0,
          132.0,
          140.0
        ],
        "otago": [
          42.0,
          45.0,
          49.0,
          58.0,
          68.0,
          72.0
        ],
        "southland": [
          25.0,
          26.0,
          27.0,
          29.0,
          31.0,
          32.0
        ]
      }
    },
    "farmland": {
      "label": "Farmland and crops",
      "shortLabel": "Farmland",
      "unit": "% land",
      "metricLabel": "Pasture and crop land-cover share",
      "summary": "Track changes in productive land cover, including intensification, urban edge pressure, forestry conversion, and crop changes.",
      "source": "New Zealand Land Cover Database and Stats NZ agricultural production",
      "sourceUrl": "https://nedc.nz/content/new-zealand-land-cover-database/",
      "lowLabel": "Lower share",
      "highLabel": "Higher share",
      "pipeline": "land_cover_database",
      "invertGood": false,
      "inflationAdjustable": false,
      "values": {
        "northland": [
          48.0,
          47.0,
          46.0,
          44.0,
          42.0,
          41.0
        ],
        "auckland": [
          32.0,
          30.0,
          28.0,
          25.0,
          22.0,
          20.0
        ],
        "waikato": [
          62.0,
          61.0,
          60.0,
          58.0,
          56.0,
          55.0
        ],
        "bay-of-plenty": [
          43.0,
          42.0,
          40.0,
          38.0,
          36.0,
          35.0
        ],
        "hawkes-bay": [
          55.0,
          54.0,
          53.0,
          51.0,
          49.0,
          48.0
        ],
        "wellington": [
          38.0,
          37.0,
          35.0,
          33.0,
          31.0,
          30.0
        ],
        "tasman-nelson": [
          31.0,
          30.0,
          29.0,
          28.0,
          27.0,
          26.0
        ],
        "canterbury": [
          58.0,
          58.0,
          57.0,
          56.0,
          55.0,
          54.0
        ],
        "otago": [
          50.0,
          49.0,
          48.0,
          47.0,
          46.0,
          45.0
        ],
        "southland": [
          64.0,
          64.0,
          63.0,
          62.0,
          61.0,
          60.0
        ]
      }
    },
    "climatePressure": {
      "label": "Climate pressure",
      "shortLabel": "Climate",
      "unit": "risk index",
      "metricLabel": "Flood, heat, and exposure index",
      "summary": "A future composite layer for coastal exposure, flood plains, drought risk, heat stress, and observed extreme-weather impacts.",
      "source": "MfE environmental reporting, NIWA climate layers, council hazard datasets",
      "sourceUrl": "https://environment.govt.nz/facts-and-science/",
      "lowLabel": "Lower pressure",
      "highLabel": "Higher pressure",
      "pipeline": "climate_pressure",
      "invertGood": false,
      "inflationAdjustable": false,
      "values": {
        "northland": [
          22.0,
          25.0,
          31.0,
          38.0,
          47.0,
          56.0
        ],
        "auckland": [
          26.0,
          30.0,
          36.0,
          43.0,
          52.0,
          60.0
        ],
        "waikato": [
          18.0,
          21.0,
          27.0,
          34.0,
          42.0,
          50.0
        ],
        "bay-of-plenty": [
          25.0,
          29.0,
          36.0,
          44.0,
          54.0,
          63.0
        ],
        "hawkes-bay": [
          24.0,
          29.0,
          37.0,
          48.0,
          62.0,
          70.0
        ],
        "wellington": [
          20.0,
          23.0,
          29.0,
          36.0,
          45.0,
          52.0
        ],
        "tasman-nelson": [
          21.0,
          25.0,
          32.0,
          40.0,
          51.0,
          60.0
        ],
        "canterbury": [
          19.0,
          23.0,
          31.0,
          41.0,
          53.0,
          62.0
        ],
        "otago": [
          17.0,
          20.0,
          27.0,
          35.0,
          45.0,
          54.0
        ],
        "southland": [
          14.0,
          17.0,
          22.0,
          29.0,
          37.0,
          45.0
        ]
      }
    },
    "politics": {
      "label": "Political position",
      "shortLabel": "Politics",
      "unit": "index",
      "metricLabel": "Regional party-vote position index",
      "summary": "Map how regional political balance changes over time. The production layer would use Electoral Commission party-vote results by electorate and map them to regions.",
      "source": "Electoral Commission election results by electorate and party vote",
      "sourceUrl": "https://electionresults.govt.nz/",
      "lowLabel": "Centre-left",
      "highLabel": "Centre-right",
      "pipeline": "electoral_commission_results",
      "invertGood": false,
      "inflationAdjustable": false,
      "values": {
        "northland": [
          56.0,
          58.0,
          62.0,
          66.0,
          60.0,
          63.0
        ],
        "auckland": [
          48.0,
          50.0,
          52.0,
          55.0,
          50.0,
          52.0
        ],
        "waikato": [
          58.0,
          60.0,
          63.0,
          66.0,
          61.0,
          65.0
        ],
        "bay-of-plenty": [
          60.0,
          62.0,
          65.0,
          68.0,
          63.0,
          66.0
        ],
        "hawkes-bay": [
          50.0,
          52.0,
          55.0,
          57.0,
          51.0,
          54.0
        ],
        "wellington": [
          38.0,
          37.0,
          40.0,
          42.0,
          35.0,
          38.0
        ],
        "tasman-nelson": [
          48.0,
          50.0,
          54.0,
          57.0,
          51.0,
          54.0
        ],
        "canterbury": [
          55.0,
          57.0,
          60.0,
          63.0,
          58.0,
          61.0
        ],
        "otago": [
          46.0,
          48.0,
          51.0,
          53.0,
          47.0,
          50.0
        ],
        "southland": [
          62.0,
          64.0,
          67.0,
          70.0,
          65.0,
          68.0
        ]
      }
    }
  },
  "pipelineRuns": [
    {
      "pipeline": "housing_affordability",
      "sourceUrl": "https://www.hud.govt.nz/stats-and-insights/local-housing-statistics",
      "mode": "seed",
      "note": "Seeded now. Target: join MHUD local housing statistics with income data and Stats NZ CPI.",
      "rowCount": 60,
      "createdAt": "2026-05-21 12:46:01"
    },
    {
      "pipeline": "stats_nz_population",
      "sourceUrl": "https://portal.apis.stats.govt.nz/",
      "mode": "seed",
      "note": "Seeded now. Target: Stats NZ API population estimates by region and census years.",
      "rowCount": 60,
      "createdAt": "2026-05-21 12:46:01"
    },
    {
      "pipeline": "broadband_rollout",
      "sourceUrl": "https://www.nationalinfrastructure.govt.nz/",
      "mode": "seed",
      "note": "Seeded now. Target: Crown Infrastructure Partners broadband rollout tables by coverage area.",
      "rowCount": 60,
      "createdAt": "2026-05-21 12:46:01"
    },
    {
      "pipeline": "rsm_cell_sites",
      "sourceUrl": "https://portal.api.business.govt.nz/api/radiospectrum-management",
      "mode": "seed",
      "note": "Seeded now. Target: RSM licence/site records aggregated to regions.",
      "rowCount": 60,
      "createdAt": "2026-05-21 12:46:01"
    },
    {
      "pipeline": "stats_nz_workplace",
      "sourceUrl": "https://www.stats.govt.nz/tools/2018-census-place-summaries/",
      "mode": "seed",
      "note": "Seeded now. Target: census workplace address and commuting flow tables.",
      "rowCount": 60,
      "createdAt": "2026-05-21 12:46:01"
    },
    {
      "pipeline": "land_cover_database",
      "sourceUrl": "https://nedc.nz/content/new-zealand-land-cover-database/",
      "mode": "seed",
      "note": "Seeded now. Target: LCDB versions grouped into productive land-cover classes.",
      "rowCount": 60,
      "createdAt": "2026-05-21 12:46:01"
    },
    {
      "pipeline": "climate_pressure",
      "sourceUrl": "https://environment.govt.nz/facts-and-science/",
      "mode": "seed",
      "note": "Seeded now. Target: MfE, NIWA, and council hazard layers composited by region.",
      "rowCount": 60,
      "createdAt": "2026-05-21 12:46:01"
    },
    {
      "pipeline": "electoral_commission_results",
      "sourceUrl": "https://electionresults.govt.nz/",
      "mode": "seed",
      "note": "Seeded now. Target: Electoral Commission party vote by electorate mapped to regions.",
      "rowCount": 60,
      "createdAt": "2026-05-21 12:46:01"
    }
  ]
};

const YEARS = NZ_CHANGE_MAP_DATA.years;
const REGIONS = NZ_CHANGE_MAP_DATA.regions;
const DATASETS = NZ_CHANGE_MAP_DATA.datasets;
const PIPELINE_RUNS = NZ_CHANGE_MAP_DATA.pipelineRuns;
