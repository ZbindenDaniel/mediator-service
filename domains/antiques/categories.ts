import type { ItemCategoryDefinition } from '../../models/item-categories';

export const itemCategories: ItemCategoryDefinition[] = [
  {
    code: 10,
    label: 'Möbel',
    subcategories: [
      { code: 101, label: 'Stühle und Sessel' },
      { code: 102, label: 'Tische' },
      { code: 103, label: 'Schränke und Vitrinen' },
      { code: 104, label: 'Kommoden und Sideboards' },
      { code: 105, label: 'Betten und Bettzubehör' },
      { code: 106, label: 'Regale und Bücherschränke' },
      { code: 107, label: 'Sonstige Möbel' }
    ]
  },
  {
    code: 20,
    label: 'Schmuck_und_Accessoires',
    subcategories: [
      { code: 201, label: 'Ringe' },
      { code: 202, label: 'Armreifen und Armbänder' },
      { code: 203, label: 'Halsketten und Anhänger' },
      { code: 204, label: 'Broschen und Nadeln' },
      { code: 205, label: 'Ohrringe' },
      { code: 206, label: 'Schmuck-Sets' }
    ]
  },
  {
    code: 30,
    label: 'Uhren',
    subcategories: [
      { code: 301, label: 'Taschenuhren' },
      { code: 302, label: 'Armbanduhren' },
      { code: 303, label: 'Standuhren' },
      { code: 304, label: 'Wanduhren' },
      { code: 305, label: 'Kaminuhren' },
      { code: 306, label: 'Uhrenteile und Zubehör' }
    ]
  },
  {
    code: 40,
    label: 'Keramik_und_Porzellan',
    subcategories: [
      { code: 401, label: 'Vasen' },
      { code: 402, label: 'Teller und Schüsseln' },
      { code: 403, label: 'Tassen und Kannen' },
      { code: 404, label: 'Figuren und Skulpturen' },
      { code: 405, label: 'Servicesätze' },
      { code: 406, label: 'Fliesen und Kacheln' }
    ]
  },
  {
    code: 50,
    label: 'Glas',
    subcategories: [
      { code: 501, label: 'Trinkgläser und Karaffen' },
      { code: 502, label: 'Glasvasen' },
      { code: 503, label: 'Schalen und Schüsseln' },
      { code: 504, label: 'Beleuchtungsglas (Lampenschirme etc.)' },
      { code: 505, label: 'Kunstglas und Bleiglas' }
    ]
  },
  {
    code: 60,
    label: 'Gemälde_und_Grafiken',
    subcategories: [
      { code: 601, label: 'Ölgemälde' },
      { code: 602, label: 'Aquarelle und Gouachen' },
      { code: 603, label: 'Grafiken und Drucke' },
      { code: 604, label: 'Zeichnungen' },
      { code: 605, label: 'Fotografien' }
    ]
  },
  {
    code: 70,
    label: 'Skulpturen_und_Plastiken',
    subcategories: [
      { code: 701, label: 'Bronze und Messing' },
      { code: 702, label: 'Holzskulpturen' },
      { code: 703, label: 'Marmor und Stein' },
      { code: 704, label: 'Keramikfiguren' },
      { code: 705, label: 'Sonstige Materialien' }
    ]
  },
  {
    code: 80,
    label: 'Silber_und_Metall',
    subcategories: [
      { code: 801, label: 'Silberbesteck' },
      { code: 802, label: 'Silberkannen und -leuchter' },
      { code: 803, label: 'Bronzeobjekte' },
      { code: 804, label: 'Zinnobjekte' },
      { code: 805, label: 'Kupfer- und Messingobjekte' }
    ]
  },
  {
    code: 90,
    label: 'Bücher_und_Druckerzeugnisse',
    subcategories: [
      { code: 901, label: 'Antiquarische Bücher' },
      { code: 902, label: 'Postkarten und Ephemera' },
      { code: 903, label: 'Landkarten und Stiche' },
      { code: 904, label: 'Manuskripte und Dokumente' },
      { code: 905, label: 'Plakate' }
    ]
  },
  {
    code: 100,
    label: 'Textilien_und_Teppiche',
    subcategories: [
      { code: 1001, label: 'Orientteppiche' },
      { code: 1002, label: 'Wandteppiche und Tapisserien' },
      { code: 1003, label: 'Stickereien und Spitzen' },
      { code: 1004, label: 'Historische Kleidung' },
      { code: 1005, label: 'Tischwäsche und Heimtextilien' }
    ]
  },
  {
    code: 110,
    label: 'Spielzeug_und_Puppen',
    subcategories: [
      { code: 1101, label: 'Antike Puppen und Puppenhaus' },
      { code: 1102, label: 'Zinn- und Bleispielzeug' },
      { code: 1103, label: 'Holzspielzeug' },
      { code: 1104, label: 'Modellbahnen und Fahrzeuge' },
      { code: 1105, label: 'Gesellschaftsspiele' }
    ]
  },
  {
    code: 120,
    label: 'Münzen_Briefmarken_Orden',
    subcategories: [
      { code: 1201, label: 'Münzen und Medaillen' },
      { code: 1202, label: 'Briefmarken' },
      { code: 1203, label: 'Banknoten' },
      { code: 1204, label: 'Orden und Auszeichnungen' }
    ]
  },
  {
    code: 130,
    label: 'Wissenschaftliche_Instrumente_und_Technik',
    subcategories: [
      { code: 1301, label: 'Messinstrumente und Optik' },
      { code: 1302, label: 'Medizinische Instrumente' },
      { code: 1303, label: 'Nautische Instrumente' },
      { code: 1304, label: 'Schreibmaschinen und Bürotechnik' },
      { code: 1305, label: 'Radios und frühe Elektronik' }
    ]
  },
  {
    code: 140,
    label: 'Dekorationsobjekte_und_Kuriositäten',
    subcategories: [
      { code: 1401, label: 'Kerzenleuchter und Kandelaber' },
      { code: 1402, label: 'Spiegel und Rahmen' },
      { code: 1403, label: 'Dosen und Behälter' },
      { code: 1404, label: 'Kuriositäten und Raritäten' },
      { code: 1405, label: 'Religiöse Objekte' }
    ]
  },
  {
    code: 200,
    label: 'Sonstiges',
    subcategories: []
  }
];
