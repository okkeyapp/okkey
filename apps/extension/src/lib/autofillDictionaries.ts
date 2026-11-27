/**
 * Owned EN+RU autofill keyword dictionaries.
 *
 * Built from WHATWG autofill tokens
 * (https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill)
 * plus original Okkey wording. Do not copy third-party keyword lists.
 */

/** SAWF-style `data-form-type` values we recognize (attribute name only; no external spec text). */
export const SAWF_DATA_FORM_TYPE_MAP: Record<string, string> = {
  password: "password",
  "current-password": "password",
  "new-password": "password",
  username: "username",
  email: "email",
  otp: "otp",
  "one-time-code": "otp",
  totp: "otp",
  tel: "tel",
  phone: "tel",
  "cc-number": "cc-number",
  "cc-csc": "cc-csc",
  "cc-exp": "cc-exp",
  "cc-name": "cc-name",
  "street-address": "street-address",
  address: "address",
  "postal-code": "postal-code",
  country: "country",
  "given-name": "given-name",
  "family-name": "family-name",
  name: "name",
};

/**
 * WHATWG autocomplete tokens we map (plus common site mistakes).
 * Site mistake: bare `password` (not in the spec) → current-password.
 */
export const WHATWG_AUTOCOMPLETE_KIND: Record<string, string> = {
  username: "username",
  "current-password": "password",
  "new-password": "password",
  "one-time-code": "otp",
  // Common non-spec site mistake
  password: "password",
  otp: "otp",
  email: "email",
  nickname: "username",
  name: "name",
  "given-name": "given-name",
  "family-name": "family-name",
  "additional-name": "additional-name",
  "organization-title": "organization-title",
  organization: "organization",
  "street-address": "street-address",
  "address-line1": "street-address",
  "address-line2": "address-apartment",
  "address-level1": "address-level1",
  "address-level2": "address-level2",
  "address-level3": "address-apartment",
  "postal-code": "postal-code",
  country: "country",
  "country-name": "country",
  tel: "tel",
  "tel-national": "tel",
  "tel-local": "tel",
  bday: "bday",
  "bday-day": "bday",
  "bday-month": "bday",
  "bday-year": "bday",
  sex: "sex",
  "cc-name": "cc-name",
  "cc-number": "cc-number",
  "cc-exp": "cc-exp",
  "cc-exp-month": "cc-exp",
  "cc-exp-year": "cc-exp",
  "cc-csc": "cc-csc",
};

/** OTP / one-time verification (EN + RU). Not backup/recovery codes. */
export const OTP_HINT =
  /one[-_\s]?time(?:[-_\s]?pass(?:word|code)?)?|email[-_]?otp|login[-_]?otp|\botp\b|\btotp\b|\b2fa\b|\bmfa\b|authenticator|verification[-_\s]?code|auth[-_\s]?code|passcode|одноразов\p{L}*[-_\s]?код|код\s*подтвержд|код\s*из\s*(?:смс|sms|письм|приложен)|проверочн\p{L}*\s*код|(?<![\p{L}\p{N}_])код\s*проверк/iu;

/** Backup / recovery / reserve codes must never classify as OTP. */
export const BACKUP_RECOVERY_CODE_HINT =
  /backup[-_\s]?codes?|recovery[-_\s]?codes?|reserve[-_\s]?codes?|emergency[-_\s]?codes?|scratch[-_\s]?codes?|резервн\p{L}*[-_\s]?код|код\w*\s*восстанов|аварийн\p{L}*[-_\s]?код|запасн\p{L}*[-_\s]?код/iu;

/** URL path/query cues for email-OTP / 2FA steps. */
export const EMAIL_OTP_URL =
  /email[-_]?otp|(?:^|\/)otp(?:\/|$|\?)|one[-_]?time|two[-_]?factor|\b2fa\b|\bmfa\b|verify(?:[-_]?code)?/i;

/** Fields that must never receive autofill. */
export const DENYLIST_HINT =
  /\b(search|filter|query|find|look[-_]?up|комментар|comment|message|chat|captcha|recaptcha|csrf|token(?![-_]?auth)|honeypot|website[-_]?url|promo[-_]?code|coupon|newsletter|subscribe)\b/i;

export const SEARCH_HINT = /\b(search|найти|поиск|искать|filter|фильтр)\b/i;

export const EMAIL_HINT =
  /e[-_.\s]?mail|emailaddress|mail(addr|to)?|user[-_]?mail|эл\.?\s*почт|электронн[а-яёa-z]*\s*почт|почт[аеуы]?|е[-]?мейл|имейл|courriel/i;

export const USER_NAME =
  /user(name)?|login|account|identifier|userid|user[-_]?id|логин|пользовател|учётн|учетн/i;

export const NICKNAME_HINT = /\bnick(?:[-_]?name)?\b|псевдоним|никнейм/i;

export const GIVEN_NAME = /given[-_]?name|first[-_]?name|fname|forename|имя(?!\s*пользовател)|имя\b/i;
export const FAMILY_NAME = /family[-_]?name|last[-_]?name|surname|lname|фамил/i;
export const ADDITIONAL_NAME = /additional[-_]?name|middle[-_]?name|отчеств/i;

export const PERSON_FULL_NAME_STRONG =
  /\b(full[-_\s]?name|display[-_\s]?name|legal[-_\s]?name|your[-_\s]?name|имя\s*и\s*фамил|полное\s*имя|\bфио\b)\b/i;

export const BARE_NAME_TOKEN = /(?:^|[^a-z0-9])name(?:[^a-z0-9]|$)/i;

export const NON_PERSON_NAME_CONTEXT =
  /\b(?:ruleset|repositor(?:y|ies)|repos?|workflow|runner|organization|organisation|\borg\b|project|team|workspace|branch|label|tag|variable|secret|environment|service|server|host(?:name)?|cluster|namespace|package|module|app(?:lication)?|product|file|folder|director(?:y|ies)|group|role|policy|permission|channel|bot|webhook|job|pipeline|artifact|bucket|schema|table|column|token|certificate|domain|site|page|section|field|form|item|resource|instance|container|image|volume|queue|topic|subscription|campaign|event|meeting|invoice|order|sku|subject|title|loyalty|program(?:me)?|provider|store|merchant|brand|club|carrier|airline|insurer|vehicle|репозитор|проект|организац|программ\p{L}*|магазин|провайдер|бренд|перевозчик|страховщик|набор\s*правил|рабоч\p{L}*\s*процесс)\b[-_\s]*(?:name|название|имя)\b|\b(?:name|название|имя)\b[-_\s]*(?:of\s+)?(?:the\s+)?(?:ruleset|repositor(?:y|ies)|repos?|workflow|runner|organization|organisation|\borg\b|project|team|workspace|program(?:me)?|provider|store|merchant|brand|club|loyalty|carrier|airline|insurer|vehicle)\b/iu;

export const TEL_HINT = /\b(phone|mobile|tel|cellphone|телефон|мобил)/i;
export const BDAY_HINT = /bday|birth[-_]?date|date[-_]?of[-_]?birth|\bdob\b|дата\s*рожд/i;
export const SEX_HINT = /\bsex\b|\bgender\b|пол\b/i;
export const ORG_HINT = /organization|company|employer|компани|организац/i;
export const ORG_TITLE = /organization[-_]?title|job[-_]?title|position|title|должност|позици/i;

export const STREET = /\b(street|address[-_]?line1|addr(?:ess)?[-_]?1)\b|улиц/i;
export const ADDRESS_FULL =
  /\b(street[-_]?address|address(?![-_]?(?:line|level|house|apartment|apt|unit|flat))\b|addr(?![-_]?\d))\b|(?<!электронн\S*\s)(?<!эл\.?\s)адрес(?!\s*(?:кошель|дома|квартир))/i;
export const HOUSE = /\b(house|building|bldg|дом)\b|address[-_]?house/i;
export const APARTMENT =
  /\b(apartment|appt?|unit|suite|flat|кв\.?|квартир|офис)\b|address[-_]?line2|address[-_]?apartment/i;
export const CITY = /address[-_]?level[-_]?2|\bcity\b|\btown\b|suburb|город/i;
export const STATE = /address[-_]?level[-_]?1|\bstate\b|province|region|област|регион|край/i;
export const POSTAL = /postal|zip|postcode|индекс/i;
export const COUNTRY = /\bcountry\b|стран[аы]|nationality|гражданств|issuing[-_]?country/i;

export const CC_NUMBER = /cc[-_]?number|card[-_]?number|cardnumber|pan\b|номер\s*карт/i;
export const CC_EXP = /cc[-_]?exp|expir|card[-_]?exp|срок\s*действ|месяц.*год|\bmm\s*\/\s*yy(?!y)/i;
export const CC_CSC = /cc[-_]?csc|cc[-_]?cvv|cvc|cvv|security[-_]?code|код\s*безопас/i;
export const CC_NAME = /cc[-_]?name|card[-_]?holder|cardholder|имя\s*владельц|держател/i;

export const IBAN = /\biban\b/i;
export const SWIFT = /swift|bic\b/i;
export const BANK_ACCOUNT = /account[-_]?number|bank[-_]?account|расчётн|расчетн|номер\s*сч[её]т/i;
export const BANK_NAME = /bank[-_]?name|название\s*банк|банк\b/i;
export const BANK_HOLDER = /account[-_]?holder|beneficiary|получател|владел.*сч/i;

export const PASSPORT_NUMBER = /passport[-_]?number|passport[-_]?no|номер\s*паспорт|серия.*номер/i;
export const PASSPORT_TYPE = /passport[-_]?type|тип\s*паспорт/i;
export const NATIONALITY = /nationality|гражданств/i;
export const ISSUING_AUTH = /issuing[-_]?authority|орган.*выдав|кем\s*выдан/i;
export const BIRTH_PLACE = /birth[-_]?place|place[-_]?of[-_]?birth|место\s*рожд/i;
export const PASSPORT_ISSUE = /issue[-_]?date|date[-_]?of[-_]?issue|дата\s*выдач/i;
export const PASSPORT_EXPIRY =
  /passport[-_]?exp|expiry[-_]?date|date[-_]?of[-_]?expiry|срок\s*действ.*паспорт|годен\s*до/i;

export const DB_SERVER = /db[-_]?host|db[-_]?server|hostname|host\b|сервер/i;
export const DB_PORT = /db[-_]?port|port\b|порт/i;
export const DB_NAME = /db[-_]?name|database|база\s*данных/i;
export const DB_USER = /db[-_]?user|db[-_]?login|db[-_]?username/i;
export const DB_PASS = /db[-_]?pass|db[-_]?password/i;
export const DB_SID = /\bsid\b|service[-_]?name/i;

export const CRYPTO_ADDR = /wallet[-_]?address|crypto[-_]?address|btc|eth[-_]?address|адрес\s*кошель/i;
export const CRYPTO_PIN = /crypto[-_]?pin|access[-_]?pin|wallet[-_]?pin/i;
export const CRYPTO_PHRASE = /passphrase|seed[-_]?phrase|mnemonic|сид[-_]?фраз|мнемоник/i;

/**
 * Loyalty / vehicle / travel — allow spaces between words so labels like
 * «License plate» / «Membership number» / «Booking reference» match.
 * Loyalty rules must win over bare payment «card number» when loyalty cues are present.
 */
export const LOYALTY_PROVIDER =
  /(?:loyalty|rewards?|bonus|discount|club|membership)[-_\s]+(?:program(?:me)?|provider|club|brand|store|merchant|issuer|name)|frequent[-_\s]+flyer[-_\s]+(?:program(?:me)?|club)|программ\p{L}*\s*лояльност|бонусн\p{L}*\s*програм|скидочн\p{L}*\s*програм|клуб\s*лояльност|название\s*(?:карт\p{L}*\s*)?(?:лояльност|программ)|поставщик\s*(?:карты\s*)?лояльност|bonusprogramm|treueprogramm|programme\s+de\s+fid[ée]lit[ée]|programa\s+de\s+fidelidad/iu;
export const LOYALTY_CARD_NUMBER =
  /loyalty[-_\s]*card[-_\s]*(?:number|no|id|code)|loyalty[-_\s]*(?:number|no|id)|(?:bonus|reward(?:s)?|club|discount)[-_\s]*card(?:[-_\s]*(?:number|no|id))?|member(?:ship)?[-_\s]*(?:card|number|id|no)|frequent[-_\s]*flyer[-_\s]*(?:number|no|id)|номер\s*(?:бонусн\p{L}*|скидочн\p{L}*|дисконтн\p{L}*|клубн\p{L}*)?\s*карт\p{L}*\s*лояльност|номер\s*(?:бонусн\p{L}*|скидочн\p{L}*|дисконтн\p{L}*|клубн\p{L}*)\s*карт|номер\s*участник|карт\p{L}*\s*лояльност|бонусн\p{L}*\s*карт|скидочн\p{L}*\s*карт|дисконтн\p{L}*\s*карт|членск\p{L}*\s*(?:карт|номер)|loyalty[-_\s]*card(?!\s*(?:holder|name))|kundenkarten?[-_\s]*nummer|num[ée]ro\s+de\s+carte\s+de\s+fid[ée]lit[ée]|n[úu]mero\s+de\s+tarjeta\s+de\s+fidelidad/iu;
export const LOYALTY_BARCODE =
  /\bbar[-_\s]?code\b|qr[-_\s]*code|qr[-_\s]*value|штрих[-_\s]*код|qr[-_\s]*код/iu;
export const LOYALTY_EXPIRY =
  /loyalty[-_\s]*expir|membership[-_\s]*expir|срок\s*действ\p{L}*\s*(?:карты\s*)?лояльност|годен\s*до.*лояльност/iu;
/** Soft loyalty form cue — remaps bare card-number when present in the same field blob. */
export const LOYALTY_CONTEXT =
  /loyalty|member(?:ship)?|frequent[-_\s]*flyer|лояльност|бонусн\p{L}*\s*(?:карт|програм)|скидочн\p{L}*\s*карт|дисконтн\p{L}*\s*карт|участник|членск|kundenkarte|treuekarte|fid[ée]lit[ée]|fidelidad/iu;

export const VEHICLE_MAKE_MODEL =
  /make[-_\s\/]*model|vehicle[-_\s]*(?:make|model)|car[-_\s]*(?:make|model)|марк\p{L}*(?:\s*[\/&]\s*|\s+и\s+|\s+)?модел|модел\p{L}*\s*авто|make\s*(?:\/|&|and)\s*model|fahrzeugmodell|marque\s*(?:\/|et)\s*mod[èe]le|marca\s*(?:\/|y)\s*modelo/iu;
export const VEHICLE_PLATE =
  /licen[cs]e[-_\s]*plate|\breg(?:istration)?[-_\s]*plate\b|\bplate[-_\s]*(?:number|no)\b|\bnumber[-_\s]*plate\b|\bvehicle[-_\s]*plate\b|\bcar[-_\s]*plate\b|гос\.?\s*номер|госномер|регистрационн\p{L}*\s*знак|номерн\p{L}*\s*знак|номер\s*(?:авто|машин|тс)|kfz[-_\s]*kennzeichen|\bkennzeichen\b|plaque\s+d['’]immatriculation|matr[íi]cula/iu;
export const VEHICLE_VIN =
  /\bvin\b|vehicle[-_\s]*identification|идентификационн\p{L}*\s*номер\s*транспорт|вин[-_\s]*код|fahrgestellnummer/iu;
export const VEHICLE_INSPECTION =
  /inspection[-_\s]*(?:due|date|expiry)|mot[-_\s]*(?:due|date|expiry)|tech[-_\s]*inspection|техосмотр|срок\s*техосмотр|hauptuntersuchung|contr[ôo]le\s+technique/iu;
export const VEHICLE_POLICY =
  /insurance[-_\s]*policy|policy[-_\s]*(?:number|no)|полис\s*(?:осаго|каско)?|номер\s*полис|страхов\p{L}*\s*полис|versicherungsnummer|num[ée]ro\s+de\s+police|n[úu]mero\s+de\s+p[óo]liza/iu;
export const VEHICLE_INSURER =
  /\binsurer\b|insurance[-_\s]*(?:company|provider|carrier)|страховщик|страхов\p{L}*\s*компани|versicherer|assureur|aseguradora/iu;
export const VEHICLE_INSURANCE_UNTIL =
  /insurance[-_\s]*(?:valid|expir)|policy[-_\s]*(?:valid|expir)|(?:insurance|policy).{0,40}valid[-_\s]*until|valid[-_\s]*until.{0,40}(?:insurance|policy)|страховк\p{L}*\s*до|полис\s*действ|действует\s*до.*страхов/iu;

export const TRAVEL_TRANSPORT =
  /transport[-_\s]*type|travel[-_\s]*mode|mode[-_\s]*of[-_\s]*transport|тип\s*транспорт|вид\s*транспорт|verkehrsmittel|type\s+de\s+transport|tipo\s+de\s+transporte/iu;
export const TRAVEL_CARRIER =
  /\bcarrier\b|\bairline\b|\brailway\b|перевозчик|авиакомпани|fluggesellschaft|compagnie\s+a[ée]rienne|aerol[íi]nea/iu;
export const TRAVEL_TRIP =
  /flight[-_\s]*(?:number|no|code)|trip[-_\s]*(?:number|no)|train[-_\s]*(?:number|no)|voyage[-_\s]*(?:number|no)|flight\s*\/\s*trip|номер\s*рейс|номер\s*поезд|номер\s*поездк|(?<![\p{L}\p{N}_])рейс(?![\p{L}\p{N}_])|flugnummer|num[ée]ro\s+de\s+vol|n[úu]mero\s+de\s+vuelo/iu;
export const TRAVEL_DEPARTURE =
  /departure[-_\s]*(?:at|date|time)|depart(?:ure)?[-_\s]*datetime|дата\s*(?:и\s*время\s*)?отправлен|время\s*отправлен|дата\s*(?:и\s*время\s*)?вылет|время\s*вылет|abflug|date\s+de\s+d[ée]part|fecha\s+de\s+salida/iu;
export const TRAVEL_FROM =
  /^\s*from(?:\s+from)*\s*$|departure[-_\s]*(?:city|airport|station|point)|\borigin\b|\bfrom[-_\s]*(?:city|airport|station)\b|\b(?:travel|trip|flight|booking|route)[-_]?from\b|откуда|пункт\s*отправлен|город\s*отправлен|аэропорт\s*вылет|abflughafen|ville\s+de\s+d[ée]part|\borigen\b/iu;
export const TRAVEL_TO =
  /^\s*to(?:\s+to)*\s*$|arrival[-_\s]*(?:city|airport|station|point)|\bdestination\b|\bto[-_\s]*(?:city|airport|station)\b|\b(?:travel|trip|flight|booking|route)[-_]?to\b|куда|пункт\s*назначен|город\s*прибыт|аэропорт\s*прил[её]т|zielflughafen|ville\s+d['’]arriv[ée]e|\bdestino\b/iu;
export const TRAVEL_BOOKING_REF =
  /\bpnr\b|booking[-_\s]*(?:ref(?:erence)?|code|number|no|id)|reservation[-_\s]*(?:code|number|ref(?:erence)?|id)|(?:booking|flight|travel|trip|ticket)[-_\s]*confirmation[-_\s]*(?:code|number|ref)?|record[-_\s]*locator|код\s*бронирован|номер\s*брони(?:рован\p{L}*)?|(?<![\p{L}\p{N}_])бронь(?![\p{L}\p{N}_])|buchungsnummer|buchungscode|num[ée]ro\s+de\s+r[ée]servation|code\s+de\s+r[ée]servation|c[óo]digo\s+de\s+reserva|localizador/iu;
export const TRAVEL_PASSENGERS =
  /\bpassengers?\b|\btravellers?\b|\btravelers?\b|пассажир|passagier|passager|pasajero/iu;
export const TRAVEL_SEATS =
  /\bseats?\b|\bseat[-_\s]*(?:number|no)\b|номер\s*мест|(?<![\p{L}\p{N}_])места(?![\p{L}\p{N}_])|место\s*в\s*(?:самол[её]т|поезд|салон)|sitzplatz|si[èe]ge|asiento/iu;

/** Form/section headings that establish specialty form scope without polluting field labels. */
export const LOYALTY_FORM_HEADING =
  /(?:loyalty|bonus|reward(?:s)?|club|discount|membership)[-_\s]+(?:card|program(?:me)?)|карт\p{L}*\s*лояльност|бонусн\p{L}*\s*(?:карт|програм)|скидочн\p{L}*\s*карт|дисконтн\p{L}*\s*карт|клубн\p{L}*\s*карт|программ\p{L}*\s*лояльност|kundenkarte|treuekarte|carte\s+de\s+fid[ée]lit[ée]|tarjeta\s+de\s+fidelidad/iu;
export const VEHICLE_FORM_HEADING =
  /\bvehicle\b|\bcar[-_\s]+(?:info|details|registration|insurance)\b|\bauto[-_\s]+insurance\b|транспортн\p{L}*\s*средств|автомобил|данные\s*авто|(?<![\p{L}\p{N}_])транспорт(?![\p{L}\p{N}_])|\bfahrzeug\b|v[ée]hicule|veh[íi]culo/iu;
export const TRAVEL_FORM_HEADING =
  /travel[-_\s]*booking|flight[-_\s]*(?:booking|reservation|check[-_\s]?in|details|info)|manage[-_\s]*booking|booking[-_\s]*(?:details|lookup|search|info|reference)|trip[-_\s]*(?:details|booking|info)|бронирован\p{L}*|поездк\p{L}*|авиабилет|перел[её]т|reisebuchung|r[ée]servation\s+de\s+vol|reserva\s+de\s+vuelo/iu;

/** Current / new / confirm password wording (EN + RU). */
export const CONFIRM_PASSWORD_HINT =
  /\b(confirm|repeat|re[-_]?type|re[-_]?enter|verify)\b.*\bpass|\bpass\w*\b.*\b(confirm|repeat)|подтверд\p{L}*\s*парол|повтор\p{L}*\s*парол|пароль\s*ещё|пароль\s*еще|ещё\s*раз|еще\s*раз/iu;

export const ACCOUNT_CREATION_PASSWORD_HINT =
  /\b(new[-_\s]?password|create[-_\s]?password|choose[-_\s]?password|set[-_\s]?password|confirm[-_\s]?password|repeat[-_\s]?password|создай(?:те)?\s*парол|новый\s*парол|придумай(?:те)?\s*парол)\b/iu;

/** Page / form headings used as context signals (EN + RU). */
export const SIGN_IN_HEADING =
  /(?<![\p{L}\p{N}_])(?:sign[-_\s]?in|log[-_\s]?in|log[-_\s]?on|войти|вход(?:[аеу]|ите)?)(?![\p{L}\p{N}_])/iu;

export const REGISTER_HEADING =
  /(?<![\p{L}\p{N}_])(?:sign[-_\s]?up|register|registration|create[-_\s]?account|регистрац\p{L}*|зарегистрир\p{L}*|создать\s*аккаунт)(?![\p{L}\p{N}_])/iu;

/**
 * Segmented OTP field-count bounds from owned synthetic fixtures
 * (`segmented-otp-4.html`, `segmented-otp-6.html`, `segmented-otp-8.html`) and unit tests.
 * Not taken from third-party projects.
 */
export const SEGMENTED_OTP_MIN_FIELDS = 4;
export const SEGMENTED_OTP_MAX_FIELDS = 8;
