/* AUTO-GENERATED from registry.csv by scripts/gen-registry.mjs — DO NOT EDIT BY HAND.
   Edit registry.csv (human source) then re-run the generator. */
import type { RegistryRow } from './registry.schema'

export const REGISTRY_ROWS: RegistryRow[] = [
  {
    "category": "settlement_type",
    "key_uk": "смт",
    "key_ru": "посёлок городского типа",
    "official_en": "urban-type settlement",
    "aliases": [
      "смт.",
      "с-ще міського типу"
    ],
    "valid_from": null,
    "valid_until": "2024-01-01",
    "source_url": "https://zakon.rada.gov.ua/laws/show/z1456-20",
    "source_authority": "Мінрегіон",
    "source_act": "Наказ №290 від 26.11.2020 (КАТОТТГ)",
    "confidence_rule": "high",
    "review_rule": "keep_type",
    "warning": "NEVER translate as city or town; category abolished Jan 2024 but appears on pre-2024 documents",
    "notes": ""
  },
  {
    "category": "settlement_type",
    "key_uk": "пгт",
    "key_ru": "посёлок городского типа",
    "official_en": "urban-type settlement",
    "aliases": [
      "п.г.т.",
      "пгт."
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://zakon.rada.gov.ua/laws/show/z1456-20",
    "source_authority": "Мінрегіон",
    "source_act": "Наказ №290 (КАТОТТГ)",
    "confidence_rule": "high",
    "review_rule": "keep_type",
    "warning": "Russian abbreviation; NEVER city or town",
    "notes": ""
  },
  {
    "category": "settlement_type",
    "key_uk": "село",
    "key_ru": "село",
    "official_en": "village",
    "aliases": [
      "с.",
      "c-ще"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://zakon.rada.gov.ua/laws/show/z1456-20",
    "source_authority": "Мінрегіон",
    "source_act": "Наказ №290 (КАТОТТГ)",
    "confidence_rule": "high",
    "review_rule": "keep_type",
    "warning": "NEVER town",
    "notes": ""
  },
  {
    "category": "settlement_type",
    "key_uk": "місто",
    "key_ru": "город",
    "official_en": "city",
    "aliases": [
      "м."
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://zakon.rada.gov.ua/laws/show/z1456-20",
    "source_authority": "Мінрегіон",
    "source_act": "Наказ №290 (КАТОТТГ)",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": ""
  },
  {
    "category": "authority",
    "key_uk": "міліція",
    "key_ru": "милиция",
    "official_en": "Militsiya",
    "aliases": [
      "міліції",
      "міліцією"
    ],
    "valid_from": null,
    "valid_until": "2015-11-07",
    "source_url": "https://zakon.rada.gov.ua/laws/show/565-2015-п",
    "source_authority": "МВС",
    "source_act": "Постанова про ліквідацію міліції",
    "confidence_rule": "high",
    "review_rule": "historical_lock",
    "warning": "Historical Soviet/early-UA police; NEVER Police, Militia, or National Police",
    "notes": ""
  },
  {
    "category": "authority",
    "key_uk": "національна поліція",
    "key_ru": "национальная полиция",
    "official_en": "National Police of Ukraine",
    "aliases": [
      "поліція",
      "нацполіція",
      "поліції"
    ],
    "valid_from": "2015-07-04",
    "valid_until": null,
    "source_url": "https://zakon.rada.gov.ua/laws/show/580-19",
    "source_authority": "ВРУ",
    "source_act": "Закон №580-VIII «Про Національну поліцію»",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": ""
  },
  {
    "category": "authority",
    "key_uk": "міністерство внутрішніх справ",
    "key_ru": "министерство внутренних дел",
    "official_en": "Ministry of Internal Affairs of Ukraine",
    "aliases": [
      "мвс"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://mvs.gov.ua/en",
    "source_authority": "МВС",
    "source_act": "",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "do not use Ministry of Interior",
    "notes": ""
  },
  {
    "category": "authority",
    "key_uk": "міністерство юстиції",
    "key_ru": "министерство юстиции",
    "official_en": "Ministry of Justice of Ukraine",
    "aliases": [
      "мінюст"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://minjust.gov.ua/en",
    "source_authority": "Мінюст",
    "source_act": "",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": ""
  },
  {
    "category": "passport_authority",
    "key_uk": "державна міграційна служба",
    "key_ru": "государственная миграционная служба",
    "official_en": "State Migration Service of Ukraine",
    "aliases": [
      "дмс"
    ],
    "valid_from": "2011-12-09",
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home",
    "source_authority": "ДМС",
    "source_act": "КМУ №1058 (2011)",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": ""
  },
  {
    "category": "civil_registry_term",
    "key_uk": "державний реєстр актів цивільного стану",
    "key_ru": "государственный реестр актов гражданского состояния",
    "official_en": "Civil Registry Office",
    "aliases": [
      "драцс",
      "відділ драцс",
      "рацс"
    ],
    "valid_from": "2013-01-01",
    "valid_until": null,
    "source_url": "https://zakon.rada.gov.ua/laws/show/1025-2010-п",
    "source_authority": "Мінюст",
    "source_act": "КМУ №1025 (10.11.2010)",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": ""
  },
  {
    "category": "civil_registry_term",
    "key_uk": "відділ запису актів цивільного стану",
    "key_ru": "отдел записи актов гражданского состояния",
    "official_en": "Civil Registry Office (ZAGS)",
    "aliases": [
      "загс",
      "загсу"
    ],
    "valid_from": null,
    "valid_until": "2012-12-31",
    "source_url": "https://zakon.rada.gov.ua/laws/show/1025-2010-п",
    "source_authority": "Мінюст",
    "source_act": "КМУ №1025; historical ZAGS",
    "confidence_rule": "high",
    "review_rule": "historical_lock",
    "warning": "Soviet/early form ЗАГС; keep ZAGS note on pre-2013 documents",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "вінницька",
    "key_ru": "винницкая",
    "official_en": "Vinnytsia Oblast",
    "aliases": [
      "вінницької",
      "вінницькій",
      "вінницьку"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "settlement",
    "key_uk": "тростянець",
    "key_ru": "тростянец",
    "official_en": "Trostianets",
    "aliases": [],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://zakon.rada.gov.ua/laws/show/z1456-20",
    "source_authority": "Держстат/Мінрегіон",
    "source_act": "КАТОТТГ / КОАТУУ",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": "Vinnytsia Oblast"
  },
  {
    "category": "settlement",
    "key_uk": "вінниця",
    "key_ru": "винница",
    "official_en": "Vinnytsia",
    "aliases": [],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://zakon.rada.gov.ua/laws/show/z1456-20",
    "source_authority": "Держстат",
    "source_act": "КОАТУУ",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": "Vinnytsia Oblast"
  },
  {
    "category": "settlement",
    "key_uk": "кропивницький",
    "key_ru": "кропивницкий",
    "official_en": "Kropyvnytskyi",
    "aliases": [],
    "valid_from": "2016-07-14",
    "valid_until": null,
    "source_url": "https://zakon.rada.gov.ua/laws/show/1351-19",
    "source_authority": "ВРУ",
    "source_act": "Постанова №1351 про перейменування Кіровограда",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": "renamed from Kirovohrad in 2016"
  },
  {
    "category": "settlement",
    "key_uk": "кіровоград",
    "key_ru": "кировоград",
    "official_en": "Kirovohrad",
    "aliases": [],
    "valid_from": null,
    "valid_until": "2016-07-14",
    "source_url": "https://zakon.rada.gov.ua/laws/show/1351-19",
    "source_authority": "ВРУ",
    "source_act": "historical name until 2016",
    "confidence_rule": "high",
    "review_rule": "historical_lock",
    "warning": "Historical name; renamed Kropyvnytskyi 2016 — do NOT modernise on older documents",
    "notes": ""
  },
  {
    "category": "abbreviation",
    "key_uk": "обл.",
    "key_ru": "обл.",
    "official_en": "oblast",
    "aliases": [
      "область",
      "обл"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://zakon.rada.gov.ua/laws/show/z1456-20",
    "source_authority": "Мінрегіон",
    "source_act": "КАТОТТГ",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": ""
  },
  {
    "category": "abbreviation",
    "key_uk": "р-н",
    "key_ru": "р-н",
    "official_en": "raion",
    "aliases": [
      "район",
      "району"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://zakon.rada.gov.ua/laws/show/z1456-20",
    "source_authority": "Мінрегіон",
    "source_act": "КАТОТТГ",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": ""
  },
  {
    "category": "military_authority",
    "key_uk": "територіальний центр комплектування",
    "key_ru": "территориальный центр комплектования",
    "official_en": "Territorial Recruitment Center",
    "aliases": [
      "тцк",
      "військовий комісаріат",
      "військкомат"
    ],
    "valid_from": "2022-07-30",
    "valid_until": null,
    "source_url": "https://zakon.rada.gov.ua/laws/show/2470-20",
    "source_authority": "МОУ",
    "source_act": "reform 2022 (former military commissariat)",
    "confidence_rule": "medium",
    "review_rule": "auto",
    "warning": "former Military Commissariat",
    "notes": ""
  },
  {
    "category": "document_type",
    "key_uk": "свідоцтво про народження",
    "key_ru": "свидетельство о рождении",
    "official_en": "Birth Certificate",
    "aliases": [],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://zakon.rada.gov.ua/laws/show/1025-2010-п",
    "source_authority": "Мінюст",
    "source_act": "КМУ №1025",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": ""
  },
  {
    "category": "field_label",
    "key_uk": "прізвище",
    "key_ru": "фамилия",
    "official_en": "Surname",
    "aliases": [],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://zakon.rada.gov.ua/laws/show/1025-2010-п",
    "source_authority": "Мінюст",
    "source_act": "КМУ №1025",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "волинська",
    "key_ru": "волынская",
    "official_en": "Volyn Oblast",
    "aliases": [
      "волинської",
      "волинській"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "дніпропетровська",
    "key_ru": "днепропетровская",
    "official_en": "Dnipropetrovsk Oblast",
    "aliases": [
      "дніпропетровської"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "донецька",
    "key_ru": "донецкая",
    "official_en": "Donetsk Oblast",
    "aliases": [
      "донецької"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "житомирська",
    "key_ru": "житомирская",
    "official_en": "Zhytomyr Oblast",
    "aliases": [
      "житомирської"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "закарпатська",
    "key_ru": "закарпатская",
    "official_en": "Zakarpattia Oblast",
    "aliases": [
      "закарпатської"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "запорізька",
    "key_ru": "запорожская",
    "official_en": "Zaporizhzhia Oblast",
    "aliases": [
      "запорізької"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "івано-франківська",
    "key_ru": "ивано-франковская",
    "official_en": "Ivano-Frankivsk Oblast",
    "aliases": [
      "івано-франківської"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "київська",
    "key_ru": "киевская",
    "official_en": "Kyiv Oblast",
    "aliases": [
      "київської"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "кіровоградська",
    "key_ru": "кировоградская",
    "official_en": "Kirovohrad Oblast",
    "aliases": [
      "кіровоградської"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "oblast kept name; city renamed Kropyvnytskyi 2016",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "луганська",
    "key_ru": "луганская",
    "official_en": "Luhansk Oblast",
    "aliases": [
      "луганської"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "львівська",
    "key_ru": "львовская",
    "official_en": "Lviv Oblast",
    "aliases": [
      "львівської"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "миколаївська",
    "key_ru": "николаевская",
    "official_en": "Mykolaiv Oblast",
    "aliases": [
      "миколаївської"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "одеська",
    "key_ru": "одесская",
    "official_en": "Odesa Oblast",
    "aliases": [
      "одеської"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "полтавська",
    "key_ru": "полтавская",
    "official_en": "Poltava Oblast",
    "aliases": [
      "полтавської"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "рівненська",
    "key_ru": "ровенская",
    "official_en": "Rivne Oblast",
    "aliases": [
      "рівненської"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "сумська",
    "key_ru": "сумская",
    "official_en": "Sumy Oblast",
    "aliases": [
      "сумської"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "тернопільська",
    "key_ru": "тернопольская",
    "official_en": "Ternopil Oblast",
    "aliases": [
      "тернопільської"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "харківська",
    "key_ru": "харьковская",
    "official_en": "Kharkiv Oblast",
    "aliases": [
      "харківської"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "херсонська",
    "key_ru": "херсонская",
    "official_en": "Kherson Oblast",
    "aliases": [
      "херсонської"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "хмельницька",
    "key_ru": "хмельницкая",
    "official_en": "Khmelnytskyi Oblast",
    "aliases": [
      "хмельницької"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "черкаська",
    "key_ru": "черкасская",
    "official_en": "Cherkasy Oblast",
    "aliases": [
      "черкаської"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "чернівецька",
    "key_ru": "черновицкая",
    "official_en": "Chernivtsi Oblast",
    "aliases": [
      "чернівецької"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "oblast",
    "key_uk": "чернігівська",
    "key_ru": "черниговская",
    "official_en": "Chernihiv Oblast",
    "aliases": [
      "чернігівської"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://dmsu.gov.ua/en-home/contacts.html",
    "source_authority": "ДМС",
    "source_act": "DMS official English oblast names",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "genitive to nominative",
    "notes": ""
  },
  {
    "category": "settlement",
    "key_uk": "київ",
    "key_ru": "киев",
    "official_en": "Kyiv",
    "aliases": [],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://zakon.rada.gov.ua/laws/show/z1456-20",
    "source_authority": "Держстат",
    "source_act": "КАТОТТГ/КОАТУУ",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": "capital"
  },
  {
    "category": "settlement",
    "key_uk": "харків",
    "key_ru": "харьков",
    "official_en": "Kharkiv",
    "aliases": [],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://zakon.rada.gov.ua/laws/show/z1456-20",
    "source_authority": "Держстат",
    "source_act": "КАТОТТГ/КОАТУУ",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": "Kharkiv Oblast"
  },
  {
    "category": "settlement",
    "key_uk": "одеса",
    "key_ru": "одесса",
    "official_en": "Odesa",
    "aliases": [],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://zakon.rada.gov.ua/laws/show/z1456-20",
    "source_authority": "Держстат",
    "source_act": "КАТОТТГ/КОАТУУ",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": "Odesa Oblast"
  },
  {
    "category": "settlement",
    "key_uk": "дніпро",
    "key_ru": "днепр",
    "official_en": "Dnipro",
    "aliases": [
      "дніпропетровськ"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://zakon.rada.gov.ua/laws/show/z1456-20",
    "source_authority": "Держстат",
    "source_act": "КАТОТТГ/КОАТУУ",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": "renamed from Dnipropetrovsk 2016"
  },
  {
    "category": "settlement",
    "key_uk": "львів",
    "key_ru": "львов",
    "official_en": "Lviv",
    "aliases": [],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://zakon.rada.gov.ua/laws/show/z1456-20",
    "source_authority": "Держстат",
    "source_act": "КАТОТТГ/КОАТУУ",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": "Lviv Oblast"
  },
  {
    "category": "authority",
    "key_uk": "пенсійний фонд",
    "key_ru": "пенсионный фонд",
    "official_en": "Pension Fund of Ukraine",
    "aliases": [
      "пфу",
      "пенсійний фонд україни"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://www.pfu.gov.ua/en/",
    "source_authority": "ПФУ",
    "source_act": "",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": ""
  },
  {
    "category": "authority",
    "key_uk": "кабінет міністрів",
    "key_ru": "кабинет министров",
    "official_en": "Cabinet of Ministers of Ukraine",
    "aliases": [
      "кму",
      "кабмін"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://www.kmu.gov.ua/en",
    "source_authority": "КМУ",
    "source_act": "",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": ""
  },
  {
    "category": "authority",
    "key_uk": "міністерство освіти і науки",
    "key_ru": "министерство образования и науки",
    "official_en": "Ministry of Education and Science of Ukraine",
    "aliases": [
      "мон"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://mon.gov.ua/en",
    "source_authority": "МОН",
    "source_act": "",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": ""
  },
  {
    "category": "authority",
    "key_uk": "міністерство охорони здоровя",
    "key_ru": "министерство здравоохранения",
    "official_en": "Ministry of Health of Ukraine",
    "aliases": [
      "моз"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://moz.gov.ua/en",
    "source_authority": "МОЗ",
    "source_act": "",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": ""
  },
  {
    "category": "authority",
    "key_uk": "міністерство розвитку громад та територій",
    "key_ru": "министерство развития общин и территорий",
    "official_en": "Ministry of Communities and Territories Development of Ukraine",
    "aliases": [
      "мінрегіон"
    ],
    "valid_from": null,
    "valid_until": null,
    "source_url": "https://www.minregion.gov.ua/en/",
    "source_authority": "Мінрегіон",
    "source_act": "",
    "confidence_rule": "high",
    "review_rule": "auto",
    "warning": "",
    "notes": ""
  }
] as RegistryRow[]
