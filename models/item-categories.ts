// TODO(agent): Sync these definitions with upstream taxonomy service when available.
export interface ItemSubcategoryDefinition {
  code: number;
  label: string;
}

export interface ItemCategoryDefinition {
  code: number;
  label: string;
  subcategories: ItemSubcategoryDefinition[];
}

export const itemCategories: ItemCategoryDefinition[] = [
  {
    code: 10,
    label: 'Computer_und_Komplettsysteme',
    subcategories: [
      { code: 101, label: 'Komplettsysteme' },
      { code: 102, label: 'Standard-PC' },
      { code: 103, label: 'Server' },
      { code: 104, label: 'Barebones, Mini-PC' },
      { code: 105, label: 'MAC' },
      { code: 106, label: 'Workstation etc.' },
      { code: 107, label: 'Exoten' },
      { code: 108, label: 'Thin-Client' }
    ]
  },
  {
    code: 20,
    label: 'Laptop_und_Zubehör',
    subcategories: [
      { code: 201, label: 'Laptop' },
      { code: 202, label: 'Laptop-Ersatzteile' },
      { code: 203, label: 'Netbook' },
      { code: 204, label: 'Tablet PC' },
      { code: 205, label: 'Laptop-Steckkarte' },
      { code: 206, label: 'Laptop-Akku' },
      { code: 207, label: 'Docking-Station' },
      { code: 208, label: 'Laptop-Tasche' },
      { code: 209, label: 'Laptop-Zubehör' }
    ]
  },
  {
    code: 30,
    label: 'Drucker_Fax_Scanner',
    subcategories: [
      { code: 301, label: 'Drucker' },
      { code: 302, label: 'Multifunktionsgerät' },
      { code: 303, label: 'Scanner' },
      { code: 304, label: 'Faxgerät' },
      { code: 305, label: 'Druckereinzelteile' },
      { code: 306, label: 'Kopierer' }
    ]
  },
  {
    code: 40,
    label: 'Monitor_Beamer_Kamera',
    subcategories: [
      { code: 401, label: 'Flachbildschirm' },
      { code: 402, label: 'TV' },
      { code: 403, label: 'Digitale Bilderrahmen' },
      { code: 404, label: 'Röhrenbildschirm' },
      { code: 405, label: 'Beamer' },
      { code: 406, label: 'Digital-Kamera' },
      { code: 407, label: 'Webcam' },
      { code: 408, label: 'Videokamera' },
      { code: 409, label: 'Ersatzteile für Monitore, TVs etc.' }
    ]
  },
  {
    code: 50,
    label: 'Tastatur_Maus_Spielsteuerung_Virtual_Reality',
    subcategories: [
      { code: 501, label: 'Tastatur' },
      { code: 502, label: 'Maus' },
      { code: 503, label: 'Desktop-Set (Tastatur und Maus)' },
      { code: 504, label: 'Spielsteuerung' },
      { code: 505, label: 'Graphik Tablett, Digital Pen' },
      { code: 506, label: '3D-Brillen' },
      { code: 507, label: 'Presenter' }
    ]
  },
  {
    code: 60,
    label: 'Mainboard_CPU_Ram',
    subcategories: [
      { code: 601, label: 'Mainboard' },
      { code: 602, label: 'Prozessor' },
      { code: 603, label: 'Arbeitsspeicher' }
    ]
  },
  {
    code: 70,
    label: 'Steckkarten',
    subcategories: [
      { code: 701, label: 'Graphikkarte' },
      { code: 702, label: 'Netzwerkkarte (Kabel)' },
      { code: 703, label: 'Soundkarte' },
      { code: 704, label: 'Schnittstellenkarte' },
      { code: 705, label: 'TV-Karte' },
      { code: 706, label: 'Analog-Modemkarte' },
      { code: 707, label: 'ISDN-Modemkarte' },
      { code: 708, label: 'Festplattenkontroller' },
      { code: 709, label: 'Multifunktionskarte' },
      { code: 710, label: 'Wireless-Karte' },
      { code: 711, label: 'CPU-Karten' }
    ]
  },
  {
    code: 80,
    label: 'Gehäuse_Netzteile_Umschalter_USB_Hubs_USV_Serverracks',
    subcategories: [
      { code: 801, label: 'PC-Gehäuse' },
      { code: 802, label: 'Festplattengehäuse' },
      { code: 803, label: 'Laufwerksgehäuse' },
      { code: 804, label: 'Netzteil extern' },
      { code: 805, label: 'Netzteil intern' },
      { code: 806, label: 'Gehäuseteile' },
      { code: 807, label: 'Umschalt-Switches' },
      { code: 808, label: 'Festplatten-Schubladen' },
      { code: 809, label: 'Serverracks' },
      { code: 810, label: 'USB-Hubs' },
      { code: 811, label: 'USV' }
    ]
  },
  {
    code: 90,
    label: 'Festplatten_Flashcards_Sticks',
    subcategories: [
      { code: 901, label: 'Festplatte' },
      { code: 902, label: 'USB-Stick' },
      { code: 903, label: 'Flashspeicher' },
      { code: 904, label: 'Kartenlesegerät' },
      { code: 905, label: 'Externe Festplatte' }
    ]
  },
  {
    code: 100,
    label: 'Laufwerke_fuer_Medien',
    subcategories: [
      { code: 1001, label: 'CD/DVD/BluRay' },
      { code: 1002, label: 'ZIP-Laufwerk' },
      { code: 1003, label: 'Diskettenlaufwerk' },
      { code: 1004, label: 'JAZ-Laufwerk' },
      { code: 1005, label: 'MO-Laufwerk' },
      { code: 1006, label: 'Bandlaufwerk' },
      { code: 1007, label: 'Sonstige Laufwerke' }
    ]
  },
  {
    code: 110,
    label: 'Medien',
    subcategories: [
      { code: 1101, label: 'Disketten' },
      { code: 1102, label: 'CD / DVD / BluRay-Disk' },
      { code: 1103, label: 'Zip-Medien' },
      { code: 1104, label: 'JAZ-Medien' },
      { code: 1105, label: 'MO-Medien' },
      { code: 1106, label: 'Bandkasetten' },
      { code: 1107, label: 'sonstige Medien' }
    ]
  },
  {
    code: 120,
    label: 'Externe_Netzwerkgeräte',
    subcategories: [
      { code: 1201, label: '5G-, LTE-, UMTS-, GPRS-, GMS-Modems' },
      { code: 1202, label: 'Wireless Adapter' },
      { code: 1203, label: 'Switch, Hub' },
      { code: 1204, label: 'Router, DSL-Modem, Wireless-AP' },
      { code: 1205, label: 'Netzwerkspeicher (NAS)' },
      { code: 1206, label: 'Analog-Modem' },
      { code: 1207, label: 'ISDN-Modem' },
      { code: 1208, label: 'Powerline Adapter' },
      { code: 1209, label: 'Print-Server' },
      { code: 1210, label: 'Firewall' },
      { code: 1211, label: 'Kabelmodem' },
      { code: 1212, label: 'Medienkonverter' }
    ]
  },
  {
    code: 130,
    label: 'Soundgeraete_Multimedia',
    subcategories: [
      { code: 1301, label: 'Internet-TV' },
      { code: 1302, label: 'Mikrophon' },
      { code: 1303, label: 'Video-Player' },
      { code: 1304, label: 'Lautsprecher' },
      { code: 1305, label: 'Kopfhörer' },
      { code: 1306, label: 'Headset' },
      { code: 1307, label: 'interne Lautsprecher' },
      { code: 1308, label: 'Sonstiges' }
    ]
  },
  {
    code: 140,
    label: 'Kühlung',
    subcategories: [
      { code: 1401, label: 'Ventilator' },
      { code: 1402, label: 'Kühlkörper' },
      { code: 1403, label: 'Kühlkörper mit Ventilator' }
    ]
  },
  {
    code: 150,
    label: 'Verbrauchsmaterial',
    subcategories: [
      { code: 1501, label: 'Lasertoner' },
      { code: 1502, label: 'Diverses Verbauchsmaterial Laserdrucker' },
      { code: 1503, label: 'Wärmeleitpaste' },
      { code: 1504, label: 'Tintenpatronen' },
      { code: 1505, label: 'Batterien' },
      { code: 1506, label: 'Farbbänder' },
      { code: 1507, label: 'Sonstiges' }
    ]
  },
  {
    code: 160,
    label: 'Kabel_Adapter_Montage',
    subcategories: [
      { code: 1601, label: 'Kabel extern' },
      { code: 1602, label: 'Kabel Intern' },
      { code: 1603, label: 'Adapter' },
      { code: 1604, label: 'Serverschienen' },
      { code: 1605, label: 'Frontblenden' },
      { code: 1606, label: 'Slot- und Mainboardblenden' },
      { code: 1607, label: 'Befestigungsmaterial' },
      { code: 1608, label: 'Frontpanel (USB etc.)' }
    ]
  },
  {
    code: 170,
    label: 'Kleinteile',
    subcategories: [
      { code: 1701, label: 'Schrauben und Muttern' },
      { code: 1702, label: 'Diverses' },
      { code: 1703, label: 'Schutzhüllen etc.' }
    ]
  },
  {
    code: 180,
    label: 'Spielkonsolen_Telefone_diverse_ext_Geraete',
    subcategories: [
      { code: 1801, label: 'Fix-Telefone und -anlagen' },
      { code: 1802, label: 'Handy, Smartphone' },
      { code: 1803, label: 'Handheld, Pager' },
      { code: 1804, label: 'Sonstige ext. Geräte' },
      { code: 1805, label: 'Spielekonsolen und Zubehör' },
      { code: 1806, label: 'Taschenrechner & Tischrechner' }
    ]
  },
  {
    code: 190,
    label: 'Elektronik_Komponenten_und_Laborbedarf',
    subcategories: [
      { code: 1901, label: 'Disketten' },
      { code: 1902, label: 'CD / DVD / BluRay-Disk' },
      { code: 1903, label: 'Zip-Medien' },
      { code: 1904, label: 'JAZ-Medien' },
      { code: 1905, label: 'MO-Medien' },
      { code: 1906, label: 'Bandkasetten' },
      { code: 1907, label: 'sonstige Medien' }
    ]
  },
  {
    code: 200,
    label: 'Non_IT',
    subcategories: []
  }
];
