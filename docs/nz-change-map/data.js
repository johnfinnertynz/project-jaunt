const YEARS = [2000, 2005, 2010, 2015, 2020, 2025];

const REGIONS = [
  {
    id: "northland",
    name: "Northland",
    coords: [-35.725, 174.323],
    shape: [[-34.42, 172.68], [-34.05, 173.35], [-34.32, 174.42], [-35.0, 175.02], [-35.72, 174.82], [-36.28, 174.22], [-36.05, 173.24], [-35.18, 172.72]]
  },
  {
    id: "auckland",
    name: "Auckland",
    coords: [-36.848, 174.763],
    shape: [[-36.22, 174.08], [-36.15, 174.88], [-36.58, 175.35], [-37.18, 175.12], [-37.32, 174.48], [-36.88, 173.98]]
  },
  {
    id: "waikato",
    name: "Waikato",
    coords: [-37.787, 175.279],
    shape: [[-37.08, 174.18], [-37.12, 175.28], [-37.55, 176.12], [-38.32, 176.02], [-38.78, 175.18], [-38.62, 174.42], [-37.82, 174.0]]
  },
  {
    id: "bay-of-plenty",
    name: "Bay of Plenty",
    coords: [-37.687, 176.166],
    shape: [[-37.12, 175.28], [-37.22, 176.08], [-37.56, 177.18], [-38.12, 177.52], [-38.32, 176.02], [-37.55, 176.12]]
  },
  {
    id: "hawkes-bay",
    name: "Hawke's Bay",
    coords: [-39.492, 176.912],
    shape: [[-38.32, 176.02], [-38.12, 177.52], [-39.0, 178.04], [-40.08, 177.24], [-40.02, 176.18], [-39.12, 175.78]]
  },
  {
    id: "wellington",
    name: "Wellington",
    coords: [-41.286, 174.776],
    shape: [[-40.02, 175.12], [-40.02, 176.18], [-40.72, 176.42], [-41.42, 175.42], [-41.6, 174.62], [-40.92, 174.28]]
  },
  {
    id: "tasman-nelson",
    name: "Tasman / Nelson",
    coords: [-41.276, 173.284],
    shape: [[-40.58, 172.5], [-40.72, 173.72], [-41.42, 174.18], [-42.18, 173.72], [-42.5, 172.64], [-41.82, 171.82]]
  },
  {
    id: "canterbury",
    name: "Canterbury",
    coords: [-43.532, 172.636],
    shape: [[-42.12, 171.58], [-42.22, 173.72], [-43.42, 174.0], [-44.78, 171.78], [-44.48, 169.98], [-43.24, 170.32]]
  },
  {
    id: "otago",
    name: "Otago",
    coords: [-45.878, 170.503],
    shape: [[-44.48, 169.98], [-44.78, 171.78], [-45.74, 171.18], [-46.28, 169.72], [-45.62, 168.52], [-44.82, 168.82]]
  },
  {
    id: "southland",
    name: "Southland",
    coords: [-46.413, 168.353],
    shape: [[-45.62, 168.52], [-46.28, 169.72], [-46.78, 168.94], [-46.68, 167.54], [-45.92, 166.86], [-45.28, 167.72]]
  }
];

const DATASETS = {
  affordability: {
    label: "Land affordability",
    shortLabel: "Affordability",
    unit: "price-to-income",
    metricLabel: "Median land/home price to income",
    summary: "Compare how hard buying land or housing feels across regions. The inflation switch shows a real-terms affordability index for the selected year.",
    source: "MHUD local housing statistics, RBNZ housing indicators, Stats NZ CPI",
    sourceUrl: "https://www.hud.govt.nz/stats-and-insights/local-housing-statistics",
    lowLabel: "More affordable",
    highLabel: "Less affordable",
    invertGood: false,
    inflationAdjustable: true,
    values: {
      northland: [3.1, 3.5, 4.7, 6.0, 7.2, 6.4],
      auckland: [4.6, 5.7, 7.8, 10.3, 11.5, 9.4],
      waikato: [3.3, 3.8, 5.1, 6.8, 8.2, 7.0],
      "bay-of-plenty": [3.6, 4.2, 5.6, 7.6, 9.1, 7.8],
      "hawkes-bay": [2.9, 3.3, 4.4, 5.9, 7.5, 6.6],
      wellington: [4.0, 4.8, 6.2, 7.7, 9.6, 7.9],
      "tasman-nelson": [3.7, 4.3, 5.5, 7.2, 8.7, 7.6],
      canterbury: [3.4, 4.1, 5.1, 5.8, 6.7, 6.2],
      otago: [3.0, 3.5, 4.6, 6.5, 8.6, 7.4],
      southland: [2.2, 2.4, 3.0, 3.7, 4.6, 4.2]
    }
  },
  population: {
    label: "Population density",
    shortLabel: "Population",
    unit: "people/km²",
    metricLabel: "Regional population density",
    summary: "See where population pressure is concentrating over time, with census and estimated-resident-population data as the target pipeline.",
    source: "Stats NZ census and population estimates",
    sourceUrl: "https://portal.apis.stats.govt.nz/",
    lowLabel: "Sparse",
    highLabel: "Dense",
    values: {
      northland: [13, 14, 15, 16, 18, 20],
      auckland: [210, 235, 260, 300, 340, 365],
      waikato: [13, 15, 16, 18, 21, 23],
      "bay-of-plenty": [18, 20, 22, 25, 30, 33],
      "hawkes-bay": [11, 12, 13, 14, 16, 17],
      wellington: [60, 64, 68, 73, 79, 82],
      "tasman-nelson": [9, 10, 11, 12, 14, 15],
      canterbury: [12, 13, 14, 16, 18, 20],
      otago: [7, 7, 8, 9, 10, 11],
      southland: [3, 3, 3, 3.2, 3.4, 3.5]
    }
  },
  fibre: {
    label: "Internet rollout",
    shortLabel: "Fibre",
    unit: "% premises",
    metricLabel: "Fibre-capable coverage",
    summary: "Track the spread of fibre-capable broadband through urban centres and later expansion areas.",
    source: "Crown Infrastructure Partners / national broadband rollout reporting",
    sourceUrl: "https://www.nationalinfrastructure.govt.nz/",
    lowLabel: "Low coverage",
    highLabel: "High coverage",
    invertGood: true,
    values: {
      northland: [0, 0, 6, 34, 64, 78],
      auckland: [0, 2, 24, 67, 86, 92],
      waikato: [0, 1, 15, 51, 78, 88],
      "bay-of-plenty": [0, 1, 14, 49, 77, 87],
      "hawkes-bay": [0, 0, 12, 45, 73, 84],
      wellington: [0, 2, 22, 66, 87, 93],
      "tasman-nelson": [0, 0, 8, 38, 70, 82],
      canterbury: [0, 2, 20, 62, 84, 91],
      otago: [0, 1, 12, 48, 75, 86],
      southland: [0, 0, 7, 33, 63, 76]
    }
  },
  cellTowers: {
    label: "Cell phone towers",
    shortLabel: "Cell towers",
    unit: "sites index",
    metricLabel: "Cell site density index",
    summary: "Show mobile infrastructure concentration using RSM licence records and open cell-site databases as the target source layer.",
    source: "RSM Register of Radio Frequencies and NZ cell-site datasets",
    sourceUrl: "https://portal.api.business.govt.nz/api/radiospectrum-management",
    lowLabel: "Fewer sites",
    highLabel: "More sites",
    values: {
      northland: [18, 24, 33, 45, 58, 68],
      auckland: [90, 120, 165, 220, 285, 330],
      waikato: [34, 46, 65, 88, 116, 137],
      "bay-of-plenty": [28, 38, 55, 78, 105, 125],
      "hawkes-bay": [20, 28, 39, 54, 70, 82],
      wellington: [58, 74, 98, 130, 168, 190],
      "tasman-nelson": [16, 22, 31, 43, 56, 65],
      canterbury: [52, 70, 96, 132, 178, 205],
      otago: [26, 34, 47, 64, 85, 99],
      southland: [12, 16, 23, 32, 42, 49]
    }
  },
  work: {
    label: "Where people work",
    shortLabel: "Work",
    unit: "commuter inflow",
    metricLabel: "Workplace concentration index",
    summary: "Explore where employment concentrates compared with where people live, using census workplace and commuting tables.",
    source: "Stats NZ census workplace address and commuting data",
    sourceUrl: "https://www.stats.govt.nz/tools/2018-census-place-summaries/",
    lowLabel: "Localised",
    highLabel: "Job hub",
    values: {
      northland: [32, 34, 35, 37, 39, 40],
      auckland: [150, 160, 173, 190, 205, 214],
      waikato: [55, 58, 62, 70, 78, 82],
      "bay-of-plenty": [46, 50, 55, 63, 72, 78],
      "hawkes-bay": [35, 37, 40, 45, 50, 52],
      wellington: [112, 118, 126, 136, 145, 148],
      "tasman-nelson": [31, 33, 35, 39, 44, 46],
      canterbury: [90, 96, 104, 118, 132, 140],
      otago: [42, 45, 49, 58, 68, 72],
      southland: [25, 26, 27, 29, 31, 32]
    }
  },
  farmland: {
    label: "Farmland and crops",
    shortLabel: "Farmland",
    unit: "% land",
    metricLabel: "Pasture and crop land-cover share",
    summary: "Track changes in productive land cover, including intensification, urban edge pressure, forestry conversion, and crop changes.",
    source: "New Zealand Land Cover Database and Stats NZ agricultural production",
    sourceUrl: "https://nedc.nz/content/new-zealand-land-cover-database/",
    lowLabel: "Lower share",
    highLabel: "Higher share",
    values: {
      northland: [48, 47, 46, 44, 42, 41],
      auckland: [32, 30, 28, 25, 22, 20],
      waikato: [62, 61, 60, 58, 56, 55],
      "bay-of-plenty": [43, 42, 40, 38, 36, 35],
      "hawkes-bay": [55, 54, 53, 51, 49, 48],
      wellington: [38, 37, 35, 33, 31, 30],
      "tasman-nelson": [31, 30, 29, 28, 27, 26],
      canterbury: [58, 58, 57, 56, 55, 54],
      otago: [50, 49, 48, 47, 46, 45],
      southland: [64, 64, 63, 62, 61, 60]
    }
  },
  climatePressure: {
    label: "Climate pressure",
    shortLabel: "Climate",
    unit: "risk index",
    metricLabel: "Flood, heat, and exposure index",
    summary: "A future composite layer for coastal exposure, flood plains, drought risk, heat stress, and observed extreme-weather impacts.",
    source: "MfE environmental reporting, NIWA climate layers, council hazard datasets",
    sourceUrl: "https://environment.govt.nz/facts-and-science/",
    lowLabel: "Lower pressure",
    highLabel: "Higher pressure",
    values: {
      northland: [22, 25, 31, 38, 47, 56],
      auckland: [26, 30, 36, 43, 52, 60],
      waikato: [18, 21, 27, 34, 42, 50],
      "bay-of-plenty": [25, 29, 36, 44, 54, 63],
      "hawkes-bay": [24, 29, 37, 48, 62, 70],
      wellington: [20, 23, 29, 36, 45, 52],
      "tasman-nelson": [21, 25, 32, 40, 51, 60],
      canterbury: [19, 23, 31, 41, 53, 62],
      otago: [17, 20, 27, 35, 45, 54],
      southland: [14, 17, 22, 29, 37, 45]
    }
  },
  politics: {
    label: "Political position",
    shortLabel: "Politics",
    unit: "index",
    metricLabel: "Regional party-vote position index",
    summary: "Map how regional political balance changes over time. The production layer would use Electoral Commission party-vote results by electorate and map them to regions.",
    source: "Electoral Commission election results by electorate and party vote",
    sourceUrl: "https://electionresults.govt.nz/",
    lowLabel: "Centre-left",
    highLabel: "Centre-right",
    values: {
      northland: [56, 58, 62, 66, 60, 63],
      auckland: [48, 50, 52, 55, 50, 52],
      waikato: [58, 60, 63, 66, 61, 65],
      "bay-of-plenty": [60, 62, 65, 68, 63, 66],
      "hawkes-bay": [50, 52, 55, 57, 51, 54],
      wellington: [38, 37, 40, 42, 35, 38],
      "tasman-nelson": [48, 50, 54, 57, 51, 54],
      canterbury: [55, 57, 60, 63, 58, 61],
      otago: [46, 48, 51, 53, 47, 50],
      southland: [62, 64, 67, 70, 65, 68]
    }
  }
};
