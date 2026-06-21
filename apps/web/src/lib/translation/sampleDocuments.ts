/**
 * Synthetic sample document definitions for the Translation Lab.
 *
 * ALL DATA IS FAKE — generated for testing purposes only.
 * No real personal information. Each document has:
 *   - expected extraction JSON (ground truth)
 *   - renderHtml() → realistic HTML that simulates the original document
 *
 * Documents include a prominent SAMPLE / НЕ ОРИГІНАЛ watermark.
 */

export type SampleId = 'passport_ua' | 'birth_cert_ua' | 'marriage_cert_ua'

export interface SampleField {
  key: string
  labelUk: string
  labelEn: string
  expectedValue: string
  group: 'personal' | 'document' | 'authority'
}

export interface SampleDocument {
  id: SampleId
  titleUk: string
  titleEn: string
  descriptionUk: string
  descriptionEn: string
  color: string
  icon: string
  prodId: string      // maps to TranslationWizard prodId / generateTranslationHTML docType
  fields: SampleField[]
  renderHtml: () => string
}

// ─── Ukrainian Passport ───────────────────────────────────────────────────────

const passportFields: SampleField[] = [
  { key: 'full_name',         labelUk: 'Прізвище',               labelEn: 'Last Name',         expectedValue: 'KOVALENKO',                                          group: 'personal'   },
  { key: 'given_names',       labelUk: "Ім'я та по батькові",    labelEn: 'Given Names',        expectedValue: 'OLENA VASYLIVNA',                                    group: 'personal'   },
  { key: 'sex',               labelUk: 'Стать',                  labelEn: 'Sex',                expectedValue: 'F',                                                  group: 'personal'   },
  { key: 'date_of_birth',     labelUk: 'Дата народження',        labelEn: 'Date of Birth',      expectedValue: '1985-03-15',                                         group: 'personal'   },
  { key: 'place_of_birth',    labelUk: 'Місце народження',       labelEn: 'Place of Birth',     expectedValue: 'KYIV, UKRAINE',                                      group: 'personal'   },
  { key: 'nationality',       labelUk: 'Громадянство',           labelEn: 'Nationality',        expectedValue: 'UKRAINIAN',                                          group: 'personal'   },
  { key: 'document_number',   labelUk: 'Номер паспорта',         labelEn: 'Passport Number',    expectedValue: 'FE123456',                                           group: 'document'   },
  { key: 'issue_date',        labelUk: 'Дата видачі',            labelEn: 'Date of Issue',      expectedValue: '2018-06-20',                                         group: 'document'   },
  { key: 'expiry_date',       labelUk: 'Термін дії до',          labelEn: 'Date of Expiry',     expectedValue: '2028-06-20',                                         group: 'document'   },
  { key: 'issuing_authority', labelUk: 'Орган видачі',           labelEn: 'Issuing Authority',  expectedValue: 'State Migration Service of Ukraine, Kyiv — No. 1007', group: 'authority'  },
]

function renderPassport(): string {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #e8e8e8; display: flex; justify-content: center; padding: 20px; font-family: 'Times New Roman', serif; }
  .page {
    width: 340px;
    background: linear-gradient(180deg, #dce8ff 0%, #eef4ff 60%, #f5f5f0 100%);
    border: 2px solid #1a237e;
    border-radius: 4px;
    padding: 14px 14px 10px;
    position: relative;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  }
  .watermark {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%,-50%) rotate(-30deg);
    font-size: 38px; font-weight: 900;
    color: rgba(200,0,0,0.12);
    white-space: nowrap; pointer-events: none; z-index: 50;
    text-align: center; line-height: 1.3;
    width: 400px; text-align: center;
  }
  .header { text-align: center; border-bottom: 1.5px solid #1a237e; padding-bottom: 8px; margin-bottom: 10px; }
  .trident { font-size: 26px; line-height: 1; margin-bottom: 3px; }
  .country { font-size: 11px; font-weight: bold; color: #1a237e; letter-spacing: 2px; }
  .doctype { font-size: 13px; font-weight: bold; color: #1a237e; letter-spacing: 1.5px; margin-top: 2px; }
  .body { display: flex; gap: 10px; margin-bottom: 10px; }
  .photo {
    width: 80px; height: 100px; flex-shrink: 0;
    background: #c8d8f0;
    border: 1px solid #90a4ae;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: #5c7a9a; font-size: 10px; text-align: center;
    border-radius: 2px;
  }
  .photo svg { margin-bottom: 4px; }
  .fields { flex: 1; display: flex; flex-direction: column; gap: 5px; }
  .field-row { border-bottom: 0.5px solid #90a4ae; padding-bottom: 3px; }
  .field-label { font-size: 7.5px; color: #555; text-transform: uppercase; letter-spacing: 0.5px; display: block; }
  .field-label-en { font-size: 7px; color: #777; display: inline; }
  .field-value { font-size: 11px; font-weight: bold; color: #0d0d0d; }
  .bottom-fields { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-bottom: 10px; }
  .mrz {
    background: #f9f9f9; border: 1px solid #ccc;
    font-family: 'Courier New', monospace; font-size: 9px;
    padding: 5px 6px; letter-spacing: 1px; color: #222;
    border-radius: 2px; line-height: 1.6;
  }
  .corner-bl { position: absolute; bottom: 42px; left: 14px; width: 20px; height: 20px; border-left: 2px solid #1a237e; border-bottom: 2px solid #1a237e; opacity: 0.4; }
  .corner-br { position: absolute; bottom: 42px; right: 14px; width: 20px; height: 20px; border-right: 2px solid #1a237e; border-bottom: 2px solid #1a237e; opacity: 0.4; }
  .page-no { position: absolute; bottom: 5px; right: 14px; font-size: 9px; color: #888; }
</style>
</head>
<body>
<div class="page">
  <div class="watermark">SAMPLE<br>НЕ ОРИГІНАЛ</div>

  <div class="header">
    <div class="trident">⚜</div>
    <div class="country">УКРАЇНА &nbsp;·&nbsp; UKRAINE</div>
    <div class="doctype">ПАСПОРТ &nbsp;·&nbsp; PASSPORT</div>
  </div>

  <div class="body">
    <div class="photo">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5c7a9a" stroke-width="1.5">
        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
      ФОТО<br>PHOTO
    </div>
    <div class="fields">
      <div class="field-row">
        <span class="field-label">Прізвище / <span class="field-label-en">Surname</span></span>
        <span class="field-value">КОВАЛЕНКО / KOVALENKO</span>
      </div>
      <div class="field-row">
        <span class="field-label">Ім'я та по батькові / <span class="field-label-en">Given names</span></span>
        <span class="field-value">ОЛЕНА ВАСИЛІВНА / OLENA VASYLIVNA</span>
      </div>
      <div class="field-row">
        <span class="field-label">Громадянство / <span class="field-label-en">Nationality</span></span>
        <span class="field-value">УКРАЇНЕЦЬ/КА / UKRAINIAN</span>
      </div>
      <div class="field-row">
        <span class="field-label">Дата народження / <span class="field-label-en">Date of birth</span></span>
        <span class="field-value">15 БЕРЕЗНЯ 1985 / 15 MAR 1985</span>
      </div>
    </div>
  </div>

  <div class="bottom-fields">
    <div class="field-row">
      <span class="field-label">Стать / <span class="field-label-en">Sex</span></span>
      <span class="field-value">Ж / F</span>
    </div>
    <div class="field-row">
      <span class="field-label">Місце народження / <span class="field-label-en">Place of birth</span></span>
      <span class="field-value">КИЇВ / KYIV</span>
    </div>
    <div class="field-row">
      <span class="field-label">Номер / <span class="field-label-en">Number</span></span>
      <span class="field-value">FE123456</span>
    </div>
    <div class="field-row">
      <span class="field-label">Дата видачі / <span class="field-label-en">Date of issue</span></span>
      <span class="field-value">20.06.2018</span>
    </div>
    <div class="field-row">
      <span class="field-label">Термін дії / <span class="field-label-en">Date of expiry</span></span>
      <span class="field-value">20.06.2028</span>
    </div>
    <div class="field-row">
      <span class="field-label">Орган / <span class="field-label-en">Authority</span></span>
      <span class="field-value">1007</span>
    </div>
  </div>

  <div class="corner-bl"></div>
  <div class="corner-br"></div>

  <div class="mrz">
    P&lt;UKRKOVALENKO&lt;&lt;OLENA&lt;VASYLIVNA&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;<br>
    FE1234568UKR8503150F2806208&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;2
  </div>

  <div class="page-no">2 / 2</div>
</div>
</body>
</html>`
}

// ─── Ukrainian Birth Certificate ──────────────────────────────────────────────

const birthCertFields: SampleField[] = [
  { key: 'full_name',         labelUk: 'Прізвище дитини',        labelEn: "Child's Last Name",    expectedValue: 'KOVALENKO',                                      group: 'personal'   },
  { key: 'given_names',       labelUk: "Ім'я дитини",            labelEn: "Child's First Name",   expectedValue: 'MARIIA',                                         group: 'personal'   },
  { key: 'date_of_birth',     labelUk: 'Дата народження',        labelEn: 'Date of Birth',        expectedValue: '2010-07-12',                                     group: 'personal'   },
  { key: 'place_of_birth',    labelUk: 'Місце народження',       labelEn: 'Place of Birth',       expectedValue: 'KYIV, UKRAINE',                                  group: 'personal'   },
  { key: 'father_name',       labelUk: "Ім'я батька",            labelEn: "Father's Full Name",   expectedValue: 'OLEKSII PETROVYCH KOVALENKO',                    group: 'personal'   },
  { key: 'mother_name',       labelUk: "Ім'я матері",            labelEn: "Mother's Full Name",   expectedValue: 'OLENA VASYLIVNA KOVALENKO (née FRANKO)',          group: 'personal'   },
  { key: 'document_number',   labelUk: 'Номер свідоцтва',        labelEn: 'Certificate Number',   expectedValue: 'I-КВ №987654',                                   group: 'document'   },
  { key: 'issue_date',        labelUk: 'Дата видачі',            labelEn: 'Date of Issue',        expectedValue: '2010-07-20',                                     group: 'document'   },
  { key: 'issuing_authority', labelUk: 'Орган РАЦС',             labelEn: 'Registry Office',      expectedValue: 'Shevchenkivskyi Civil Registry Office, Kyiv',    group: 'authority'  },
]

function renderBirthCert(): string {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #e8e8e8; display: flex; justify-content: center; padding: 20px; font-family: 'Times New Roman', serif; }
  .cert {
    width: 360px; background: #fffdf5;
    border: 3px double #b8860b;
    padding: 18px 20px;
    position: relative; overflow: hidden;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  }
  .corner { position: absolute; width: 28px; height: 28px; }
  .corner.tl { top: 5px; left: 5px; border-top: 3px solid #b8860b; border-left: 3px solid #b8860b; }
  .corner.tr { top: 5px; right: 5px; border-top: 3px solid #b8860b; border-right: 3px solid #b8860b; }
  .corner.bl { bottom: 5px; left: 5px; border-bottom: 3px solid #b8860b; border-left: 3px solid #b8860b; }
  .corner.br { bottom: 5px; right: 5px; border-bottom: 3px solid #b8860b; border-right: 3px solid #b8860b; }
  .watermark {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%,-50%) rotate(-30deg);
    font-size: 36px; font-weight: 900;
    color: rgba(200,0,0,0.10);
    white-space: nowrap; pointer-events: none; z-index: 50;
    width: 380px; text-align: center; line-height: 1.3;
  }
  .header { text-align: center; margin-bottom: 14px; }
  .emblem { font-size: 28px; margin-bottom: 4px; }
  .state { font-size: 9px; letter-spacing: 1.5px; color: #555; text-transform: uppercase; }
  .title { font-size: 14px; font-weight: bold; color: #8b1a1a; text-transform: uppercase; letter-spacing: 1px; margin-top: 6px; border-top: 1px solid #b8860b; border-bottom: 1px solid #b8860b; padding: 5px 0; }
  .subtitle { font-size: 10px; color: #8b1a1a; font-style: italic; margin-top: 3px; }
  .reg-info { text-align: center; font-size: 10px; color: #555; margin-bottom: 12px; }
  .fields { display: flex; flex-direction: column; gap: 8px; }
  .field-row { border-bottom: 0.75px solid #ccc; padding-bottom: 5px; }
  .field-label { font-size: 8px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .field-value { font-size: 12px; font-weight: bold; color: #111; }
  .field-sub { font-size: 9px; color: #444; font-style: italic; }
  .parents { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 2px; }
  .seal-area { margin-top: 14px; display: flex; justify-content: space-between; align-items: flex-end; }
  .seal { width: 54px; height: 54px; border-radius: 50%; border: 2px dashed #b8860b; display: flex; align-items: center; justify-content: center; color: #b8860b; font-size: 8px; text-align: center; line-height: 1.2; }
  .registrar { font-size: 9px; color: #555; text-align: right; }
  .docno { font-size: 10px; color: #333; font-family: monospace; }
</style>
</head>
<body>
<div class="cert">
  <div class="corner tl"></div><div class="corner tr"></div>
  <div class="corner bl"></div><div class="corner br"></div>
  <div class="watermark">SAMPLE<br>НЕ ОРИГІНАЛ</div>

  <div class="header">
    <div class="emblem">⚜</div>
    <div class="state">Україна · Ukraine</div>
    <div class="title">Свідоцтво про народження<br><span style="font-size:11px">Birth Certificate</span></div>
    <div class="subtitle">Серія / Series: I-КВ &nbsp;&nbsp; №987654</div>
  </div>

  <div class="reg-info">Актовий запис № 834 від 12.07.2010 · Act record No. 834 of 12.07.2010</div>

  <div class="fields">
    <div class="field-row">
      <div class="field-label">Прізвище, ім'я та по батькові / Full name of child</div>
      <div class="field-value">КОВАЛЕНКО МАРІЯ ОЛЕКСІЇВНА</div>
      <div class="field-sub">KOVALENKO MARIIA OLEKSIIVNA</div>
    </div>
    <div class="field-row">
      <div class="field-label">Дата народження / Date of birth</div>
      <div class="field-value">12 ЛИПНЯ 2010 · 12 JULY 2010</div>
    </div>
    <div class="field-row">
      <div class="field-label">Місце народження / Place of birth</div>
      <div class="field-value">м. Київ, Україна · Kyiv, Ukraine</div>
    </div>
    <div class="field-row">
      <div class="field-label">Стать / Sex</div>
      <div class="field-value">Жіноча / Female</div>
    </div>
    <div class="parents">
      <div class="field-row">
        <div class="field-label">Батько / Father</div>
        <div class="field-value" style="font-size:11px">КОВАЛЕНКО<br>ОЛЕКСІЙ ПЕТРОВИЧ</div>
        <div class="field-sub">KOVALENKO OLEKSII PETROVYCH</div>
      </div>
      <div class="field-row">
        <div class="field-label">Мати / Mother</div>
        <div class="field-value" style="font-size:11px">КОВАЛЕНКО<br>ОЛЕНА ВАСИЛІВНА</div>
        <div class="field-sub">KOVALENKO OLENA VASYLIVNA<br><i style="font-size:8px">(до шлюбу / née: ФРАНКО / FRANKO)</i></div>
      </div>
    </div>
    <div class="field-row">
      <div class="field-label">Орган реєстрації / Registry office</div>
      <div class="field-value" style="font-size:11px">Шевченківський РАЦС м. Київ</div>
      <div class="field-sub">Shevchenkivskyi Civil Registry Office, Kyiv</div>
    </div>
    <div class="field-row">
      <div class="field-label">Дата видачі / Date of issue</div>
      <div class="field-value">20.07.2010</div>
    </div>
  </div>

  <div class="seal-area">
    <div class="seal">М.П.<br>SEAL</div>
    <div class="registrar">
      Реєстратор / Registrar:<br>
      <span style="font-size:10px">__________________</span><br>
      <span style="font-size:8px">підпис / signature</span>
    </div>
  </div>
</div>
</body>
</html>`
}

// ─── Ukrainian Marriage Certificate ──────────────────────────────────────────

const marriageCertFields: SampleField[] = [
  { key: 'spouse1_name',      labelUk: 'Прізвище чоловіка',              labelEn: "Husband's Last Name",      expectedValue: 'KOVALENKO',                                    group: 'personal'   },
  { key: 'given_names',       labelUk: "Ім'я та по батькові чоловіка",   labelEn: "Husband's Full Name",      expectedValue: 'OLEKSII PETROVYCH',                            group: 'personal'   },
  { key: 'spouse2_name',      labelUk: 'Прізвище дружини (до шлюбу)',    labelEn: "Wife's Maiden Last Name",  expectedValue: 'FRANKO',                                       group: 'personal'   },
  { key: 'mother_name',       labelUk: "Ім'я та по батькові дружини",    labelEn: "Wife's Full Name",         expectedValue: 'OLENA VASYLIVNA',                              group: 'personal'   },
  { key: 'date_of_marriage',  labelUk: 'Дата реєстрації шлюбу',          labelEn: 'Date of Marriage',         expectedValue: '2009-05-15',                                   group: 'document'   },
  { key: 'document_number',   labelUk: 'Номер свідоцтва',                labelEn: 'Certificate Number',       expectedValue: 'КВ №112233',                                   group: 'document'   },
  { key: 'issue_date',        labelUk: 'Дата видачі',                    labelEn: 'Date of Issue',            expectedValue: '2009-05-15',                                   group: 'document'   },
  { key: 'issuing_authority', labelUk: 'Орган РАЦС',                     labelEn: 'Registry Office',          expectedValue: 'Pecherskyi Civil Registry Office, Kyiv',       group: 'authority'  },
]

function renderMarriageCert(): string {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #e8e8e8; display: flex; justify-content: center; padding: 20px; font-family: 'Times New Roman', serif; }
  .cert {
    width: 360px; background: #fff8f8;
    border: 3px double #8b1a4a;
    padding: 18px 20px;
    position: relative; overflow: hidden;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  }
  .corner { position: absolute; width: 28px; height: 28px; }
  .corner.tl { top: 5px; left: 5px; border-top: 3px solid #8b1a4a; border-left: 3px solid #8b1a4a; }
  .corner.tr { top: 5px; right: 5px; border-top: 3px solid #8b1a4a; border-right: 3px solid #8b1a4a; }
  .corner.bl { bottom: 5px; left: 5px; border-bottom: 3px solid #8b1a4a; border-left: 3px solid #8b1a4a; }
  .corner.br { bottom: 5px; right: 5px; border-bottom: 3px solid #8b1a4a; border-right: 3px solid #8b1a4a; }
  .watermark {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%,-50%) rotate(-30deg);
    font-size: 36px; font-weight: 900;
    color: rgba(200,0,0,0.10);
    white-space: nowrap; pointer-events: none; z-index: 50;
    width: 380px; text-align: center; line-height: 1.3;
  }
  .header { text-align: center; margin-bottom: 14px; }
  .emblem { font-size: 28px; margin-bottom: 4px; }
  .state { font-size: 9px; letter-spacing: 1.5px; color: #555; text-transform: uppercase; }
  .rings { font-size: 22px; margin: 4px 0; }
  .title { font-size: 13px; font-weight: bold; color: #8b1a4a; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 6px; border-top: 1px solid #8b1a4a; border-bottom: 1px solid #8b1a4a; padding: 5px 0; }
  .subtitle { font-size: 10px; color: #8b1a4a; font-style: italic; margin-top: 3px; }
  .reg-info { text-align: center; font-size: 10px; color: #555; margin-bottom: 12px; }
  .fields { display: flex; flex-direction: column; gap: 8px; }
  .field-row { border-bottom: 0.75px solid #e8c0cc; padding-bottom: 5px; }
  .field-label { font-size: 8px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .field-value { font-size: 12px; font-weight: bold; color: #111; }
  .field-sub { font-size: 9px; color: #444; font-style: italic; }
  .spouses { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .seal-area { margin-top: 14px; display: flex; justify-content: space-between; align-items: flex-end; }
  .seal { width: 54px; height: 54px; border-radius: 50%; border: 2px dashed #8b1a4a; display: flex; align-items: center; justify-content: center; color: #8b1a4a; font-size: 8px; text-align: center; }
  .registrar { font-size: 9px; color: #555; text-align: right; }
</style>
</head>
<body>
<div class="cert">
  <div class="corner tl"></div><div class="corner tr"></div>
  <div class="corner bl"></div><div class="corner br"></div>
  <div class="watermark">SAMPLE<br>НЕ ОРИГІНАЛ</div>

  <div class="header">
    <div class="emblem">⚜</div>
    <div class="state">Україна · Ukraine</div>
    <div class="rings">⚭</div>
    <div class="title">Свідоцтво про укладення шлюбу<br><span style="font-size:10px">Marriage Certificate</span></div>
    <div class="subtitle">Серія КВ №112233</div>
  </div>

  <div class="reg-info">Актовий запис № 241 від 15.05.2009 · Act No. 241 of 15.05.2009</div>

  <div class="fields">
    <div class="spouses">
      <div class="field-row">
        <div class="field-label">Чоловік / Husband</div>
        <div class="field-value" style="font-size:11px">КОВАЛЕНКО<br>ОЛЕКСІЙ ПЕТРОВИЧ</div>
        <div class="field-sub">KOVALENKO<br>OLEKSII PETROVYCH</div>
      </div>
      <div class="field-row">
        <div class="field-label">Дружина / Wife</div>
        <div class="field-value" style="font-size:11px">ФРАНКО<br>ОЛЕНА ВАСИЛІВНА</div>
        <div class="field-sub">FRANKO<br>OLENA VASYLIVNA</div>
      </div>
    </div>
    <div class="field-row">
      <div class="field-label">Після реєстрації / After registration — Прізвище</div>
      <div class="field-value">КОВАЛЕНКО / KOVALENKO</div>
    </div>
    <div class="field-row">
      <div class="field-label">Дата та місце реєстрації шлюбу / Date and place of marriage</div>
      <div class="field-value">15 ТРАВНЯ 2009 · 15 MAY 2009</div>
      <div class="field-sub">м. Київ · Kyiv</div>
    </div>
    <div class="field-row">
      <div class="field-label">Орган реєстрації / Registry office</div>
      <div class="field-value" style="font-size:11px">Печерський РАЦС м. Київ</div>
      <div class="field-sub">Pecherskyi Civil Registry Office, Kyiv</div>
    </div>
    <div class="field-row">
      <div class="field-label">Дата видачі / Date of issue</div>
      <div class="field-value">15.05.2009</div>
    </div>
  </div>

  <div class="seal-area">
    <div class="seal">М.П.<br>SEAL</div>
    <div class="registrar">
      Реєстратор / Registrar:<br>
      <span style="font-size:10px">__________________</span><br>
      <span style="font-size:8px">підпис / signature</span>
    </div>
  </div>
</div>
</body>
</html>`
}

// ─── Exported sample registry ─────────────────────────────────────────────────

export const SAMPLE_DOCUMENTS: SampleDocument[] = [
  {
    id: 'passport_ua',
    titleUk: 'Паспорт України',
    titleEn: 'Ukrainian Passport',
    descriptionUk: 'Біометричний закордонний паспорт, зразок 2015+ року',
    descriptionEn: 'Biometric international passport, 2015+ format',
    color: 'linear-gradient(150deg,#1e40af 0%,#3b82f6 100%)',
    icon: '🛂',
    prodId: 'passport',
    fields: passportFields,
    renderHtml: renderPassport,
  },
  {
    id: 'birth_cert_ua',
    titleUk: 'Свідоцтво про народження',
    titleEn: 'Ukrainian Birth Certificate',
    descriptionUk: 'Свідоцтво про народження, форма РАЦС',
    descriptionEn: 'Civil registry birth certificate (RATSS form)',
    color: 'linear-gradient(150deg,#92400e 0%,#f59e0b 100%)',
    icon: '📜',
    prodId: 'birth-certificate',
    fields: birthCertFields,
    renderHtml: renderBirthCert,
  },
  {
    id: 'marriage_cert_ua',
    titleUk: 'Свідоцтво про шлюб',
    titleEn: 'Ukrainian Marriage Certificate',
    descriptionUk: 'Свідоцтво про укладення шлюбу, форма РАЦС',
    descriptionEn: 'Civil registry marriage certificate (RATSS form)',
    color: 'linear-gradient(150deg,#881337 0%,#f472b6 100%)',
    icon: '💍',
    prodId: 'marriage-certificate',
    fields: marriageCertFields,
    renderHtml: renderMarriageCert,
  },
]

export function getSampleById(id: SampleId): SampleDocument | undefined {
  return SAMPLE_DOCUMENTS.find((s) => s.id === id)
}
