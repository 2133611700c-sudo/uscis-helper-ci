/** Death Certificate (Свідоцтво про смерть). Source: KMU No.1025 (10.11.2010). */
import type { OfficialFormSchema } from './types'
const tr=(k:string,uk:string,en:string,g:string,req=true)=>({key:k,sourceLabelUk:uk,sourceLabelEn:en,required:req,fieldGroup:g,expectedScript:'cyrillic' as const,translationRule:'transliterate_kmu55' as const,lockedEntity:true,evidenceRequired:true})
export const deathCertificateSchema: OfficialFormSchema = {
  docType:'ua_death_certificate', titleEn:'DEATH CERTIFICATE',
  officialSource:{act:'КМУ Resolution No. 1025, 10.11.2010',url:'https://zakon.rada.gov.ua/laws/show/1025-2010-%D0%BF',authority:'Cabinet of Ministers of Ukraine / Ministry of Justice',effectiveDate:'2010-11-10'},
  fields:[
    tr('deceased_surname','Прізвище','Surname','deceased'),
    tr('deceased_given_name',"Ім'я",'Given name','deceased'),
    tr('deceased_patronymic','По батькові','Patronymic','deceased'),
    {key:'date_of_birth',sourceLabelUk:'дата народження',sourceLabelEn:'Date of birth',required:false,fieldGroup:'deceased',expectedScript:'mixed',translationRule:'date_normalize',lockedEntity:true,evidenceRequired:true},
    {key:'date_of_death',sourceLabelUk:'дата смерті',sourceLabelEn:'Date of death',required:true,fieldGroup:'deceased',expectedScript:'mixed',translationRule:'date_normalize',lockedEntity:true,evidenceRequired:true},
    {key:'place_of_death',sourceLabelUk:'місце смерті',sourceLabelEn:'Place of death',required:false,fieldGroup:'deceased',expectedScript:'cyrillic',translationRule:'place_gazetteer',lockedEntity:false,evidenceRequired:true},
    {key:'act_record_number',sourceLabelUk:'актовий запис №',sourceLabelEn:'Act record No.',required:true,fieldGroup:'actRecord',expectedScript:'numeric',translationRule:'locked_verbatim',lockedEntity:true,evidenceRequired:true},
    {key:'act_record_date',sourceLabelUk:'дата складання актового запису',sourceLabelEn:'Act record date',required:false,fieldGroup:'actRecord',expectedScript:'mixed',translationRule:'date_normalize',lockedEntity:true,evidenceRequired:true},
    {key:'place_of_registration',sourceLabelUk:'місце державної реєстрації',sourceLabelEn:'Place of state registration',required:true,fieldGroup:'issuing',expectedScript:'cyrillic',translationRule:'glossary_authority',lockedEntity:false,evidenceRequired:true},
    {key:'series_number',sourceLabelUk:'Серія та номер',sourceLabelEn:'Series and No.',required:true,fieldGroup:'issuing',expectedScript:'mixed',translationRule:'locked_verbatim',lockedEntity:true,evidenceRequired:true},
    {key:'date_of_issue',sourceLabelUk:'Дата видачі',sourceLabelEn:'Date of issue',required:false,fieldGroup:'issuing',expectedScript:'mixed',translationRule:'date_normalize',lockedEntity:true,evidenceRequired:true},
  ],
  layoutSections:['header','personFields','actRecord','issuingAuthority','seals','signatures','certification'],
}
