/** Divorce Certificate (Свідоцтво про розірвання шлюбу). Source: KMU No.1025 (10.11.2010). */
import type { OfficialFormSchema } from './types'
const tr = (k:string,uk:string,en:string,g:string,req=true)=>({key:k,sourceLabelUk:uk,sourceLabelEn:en,required:req,fieldGroup:g,expectedScript:'cyrillic' as const,translationRule:'transliterate_kmu55' as const,lockedEntity:true,evidenceRequired:true})
export const divorceCertificateSchema: OfficialFormSchema = {
  docType:'ua_divorce_certificate', titleEn:'CERTIFICATE OF DISSOLUTION OF MARRIAGE',
  officialSource:{act:'КМУ Resolution No. 1025, 10.11.2010',url:'https://zakon.rada.gov.ua/laws/show/1025-2010-%D0%BF',authority:'Cabinet of Ministers of Ukraine / Ministry of Justice',effectiveDate:'2010-11-10'},
  fields:[
    // ── former husband (split per official blank) ──
    tr('groom_surname','Прізвище','Surname','groom'),
    tr('groom_given_name',"Ім'я",'Given name','groom'),
    tr('groom_patronymic','По батькові','Patronymic','groom',false),
    // ── former wife ──
    tr('bride_surname','Прізвище','Surname','bride'),
    tr('bride_given_name',"Ім'я",'Given name','bride'),
    tr('bride_patronymic','По батькові','Patronymic','bride',false),
    // ── dissolution ──
    {key:'date_of_dissolution',sourceLabelUk:'шлюб розірвано',sourceLabelEn:'Date of dissolution',required:true,fieldGroup:'dissolution',expectedScript:'mixed',translationRule:'date_normalize',lockedEntity:true,evidenceRequired:true},
    tr('groom_surname_after','прізвище чоловіка після розірвання','Husband’s surname after dissolution','dissolution',false),
    tr('bride_surname_after','прізвище дружини після розірвання','Wife’s surname after dissolution','dissolution',false),
    // ── act record ──
    {key:'act_record_number',sourceLabelUk:'актовий запис №',sourceLabelEn:'Act record No.',required:true,fieldGroup:'actRecord',expectedScript:'numeric',translationRule:'locked_verbatim',lockedEntity:true,evidenceRequired:true},
    {key:'act_record_date',sourceLabelUk:'дата складання актового запису',sourceLabelEn:'Act record date',required:false,fieldGroup:'actRecord',expectedScript:'mixed',translationRule:'date_normalize',lockedEntity:true,evidenceRequired:true},
    // ── issuing ──
    {key:'place_of_registration',sourceLabelUk:'місце державної реєстрації',sourceLabelEn:'Place of state registration',required:true,fieldGroup:'issuing',expectedScript:'cyrillic',translationRule:'glossary_authority',lockedEntity:false,evidenceRequired:true},
    {key:'series_number',sourceLabelUk:'Серія та номер',sourceLabelEn:'Series and No.',required:true,fieldGroup:'issuing',expectedScript:'mixed',translationRule:'locked_verbatim',lockedEntity:true,evidenceRequired:true},
    {key:'date_of_issue',sourceLabelUk:'Дата видачі',sourceLabelEn:'Date of issue',required:false,fieldGroup:'issuing',expectedScript:'mixed',translationRule:'date_normalize',lockedEntity:true,evidenceRequired:true},
  ],
  layoutSections:['header','personFields','actRecord','issuingAuthority','seals','signatures','certification'],
}
