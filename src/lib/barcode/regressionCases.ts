export type BarcodeRegressionExpectation = {
  cleanName?: string;
  cleanNameIncludes?: string[];
  platformKey?: string | null;
  shelfType?: string;
  maxMatches?: number;
  minConfidence?: number;
  suggestionsInclude?: string[];
  suggestionsExclude?: string[];
  providerIncludes?: string[];
};

export type BarcodeRegressionCase = {
  id: string;
  label: string;
  barcode: string;
  type?: string;
  expected: BarcodeRegressionExpectation;
};

export const DEFAULT_BARCODE_REGRESSION_CASES: BarcodeRegressionCase[] = [
  {
    id: "rayman-rabbids-tv-party-wii",
    label: "Rayman Prod' presente : The Lapins Cretins Show",
    barcode: "3307211503465",
    type: "games",
    expected: {
      cleanName: "Rayman Prod' présente : The Lapins Crétins Show",
      platformKey: "wii",
      shelfType: "games",
      maxMatches: 1,
      minConfidence: 0.9,
      providerIncludes: ["ScreenScraper"],
    },
  },
  {
    id: "links-crossbow-training-wii",
    label: "Link's Crossbow Training",
    barcode: "0045496364649",
    type: "games",
    expected: {
      cleanName: "Link's Crossbow Training",
      platformKey: "wii",
      shelfType: "games",
      maxMatches: 1,
      minConfidence: 0.9,
      providerIncludes: ["ScreenScraper"],
      suggestionsExclude: ["zapper"],
    },
  },
  {
    id: "zelda-twilight-princess-wii",
    label: "The Legend of Zelda : Twilight Princess",
    barcode: "0045496362409",
    type: "games",
    expected: {
      cleanName: "The Legend of Zelda : Twilight Princess",
      platformKey: "wii",
      shelfType: "games",
      maxMatches: 1,
      minConfidence: 0.9,
      suggestionsExclude: ["Vintage", "Old", "PAL FR Jeux Vidéo"],
    },
  },
  {
    id: "deepak-chopra-leela-wii",
    label: "Deepak Chopra's Leela",
    barcode: "4005209153157",
    type: "games",
    expected: {
      cleanName: "Deepak Chopra's Leela",
      platformKey: "wii",
      shelfType: "games",
      maxMatches: 1,
      suggestionsExclude: [" pour"],
    },
  },
  {
    id: "super-monkey-ball-banana-blitz-wii",
    label: "Super Monkey Ball : Banana Blitz",
    barcode: "5060004769360",
    type: "games",
    expected: {
      cleanName: "Super Monkey Ball : Banana Blitz",
      platformKey: "wii",
      shelfType: "games",
      maxMatches: 1,
      suggestionsExclude: ["BOITE", "SANS LIVRET"],
    },
  },
  {
    id: "super-mario-galaxy-wii",
    label: "Super Mario Galaxy",
    barcode: "0045496363949",
    type: "games",
    expected: {
      cleanName: "Super Mario Galaxy",
      platformKey: "wii",
      shelfType: "games",
      maxMatches: 1,
    },
  },
  {
    id: "star-wars-force-unleashed-2-wii",
    label: "Star Wars - Le Pouvoir de la Force II",
    barcode: "0023272010102",
    type: "games",
    expected: {
      cleanName: "Star Wars - Le Pouvoir de la Force II",
      platformKey: "wii",
      shelfType: "games",
      maxMatches: 1,
      suggestionsExclude: ["Lylat Wars"],
    },
  },
  {
    id: "mario-party-8-wii",
    label: "Mario Party 8",
    barcode: "0045496362874",
    type: "games",
    expected: {
      cleanName: "Mario Party 8",
      platformKey: "wii",
      shelfType: "games",
      maxMatches: 1,
      suggestionsExclude: ["Marioparty"],
    },
  },
  {
    id: "mario-kart-wii",
    label: "Mario Kart Wii",
    barcode: "0045496365226",
    type: "games",
    expected: {
      cleanName: "Mario Kart Wii",
      platformKey: "wii",
      shelfType: "games",
      maxMatches: 1,
      minConfidence: 0.9,
      suggestionsExclude: ["Jeu Vidéo"],
    },
  },
  {
    id: "mario-sonic-winter-games-wii",
    label: "Mario & Sonic aux Jeux Olympiques d'Hiver",
    barcode: "5055277000852",
    type: "games",
    expected: {
      cleanName: "Mario & Sonic aux Jeux Olympiques d'Hiver",
      platformKey: "wii",
      shelfType: "games",
      maxMatches: 1,
      minConfidence: 0.9,
    },
  },
  {
    id: "resident-evil-umbrella-chronicles-wii",
    label: "Resident Evil : The Umbrella Chronicles",
    barcode: "0045496364175",
    type: "games",
    expected: {
      cleanName: "Resident Evil : The Umbrella Chronicles",
      platformKey: "wii",
      shelfType: "games",
      maxMatches: 1,
      suggestionsExclude: [" pour"],
    },
  },
  {
    id: "qui-veut-gagner-des-millions-wii",
    label: "Qui Veut Gagner Des Millions : 1ère Edition",
    barcode: "3307210323361",
    type: "games",
    expected: {
      cleanName: "Qui Veut Gagner Des Millions : 1ère Edition",
      platformKey: "wii",
      shelfType: "games",
      maxMatches: 1,
    },
  },
  {
    id: "new-super-mario-bros-wii",
    label: "New Super Mario Bros. Wii",
    barcode: "0045496368104",
    type: "games",
    expected: {
      cleanName: "New Super Mario Bros. Wii",
      platformKey: "wii",
      shelfType: "games",
      maxMatches: 1,
      suggestionsExclude: ["Scellé"],
    },
  },
  {
    id: "sports-island-wii",
    label: "Sports Island",
    barcode: "4012927091067",
    type: "games",
    expected: {
      cleanName: "Sports Island",
      platformKey: "wii",
      shelfType: "games",
      maxMatches: 1,
    },
  },
  {
    id: "halo-2-xbox",
    label: "Halo 2",
    barcode: "0882224088060",
    type: "games",
    expected: {
      cleanName: "Halo 2",
      platformKey: "xbox",
      shelfType: "games",
      maxMatches: 1,
    },
  },
  {
    id: "star-wars-revenge-sith-xbox-untyped",
    label:
      "Star Wars Episode III : La Revanche des Sith (Xbox, scan sans étagère)",
    barcode: "023272327521",
    // `type` omis : scan générique → la sélection de type (jeu vs film) est
    // exercée. Un jeu Xbox homonyme du film ne doit pas être classé "movies"
    // via le match TMDB du film, ni hériter d'un titre étranger (hongrois).
    expected: {
      cleanNameIncludes: ["Revanche des Sith"],
      platformKey: "xbox",
      shelfType: "games",
      suggestionsExclude: ["bosszúja", "venganza", "vendetta"],
    },
  },
];
