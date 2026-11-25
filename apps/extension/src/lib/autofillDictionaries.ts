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
  /\b(?:ruleset|repositor(?:y|ies)|repos?|workflow|runner|organization|organisation|\borg\b|project|team|workspace|branch|label|tag|variable|secret|environment|service|server|host(?:name)?|cluster|namespace|package|module|app(?:lication)?|product|file|folder|director(?:y|ies)|group|role|policy|permission|channel|bot|webhook|job|pipeline|artifact|bucket|schema|table|column|token|certificate|domain|site|page|section|field|form|item|resource|instance|container|image|volume|queue|topic|subscription|campaign|event|meeting|invoice|order|sku|subject|title|репозитор|проект|организац|набор\s*правил|рабоч\w*\s*процесс)\b[-_\s]*(?:name|название|имя)\b|\b(?:name|название|имя)\b[-_\s]*(?:of\s+)?(?:the\s+)?(?:ruleset|repositor(?:y|ies)|repos?|workflow|runner|organization|organisation|\borg\b|project|team|workspace)\b/i;

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
  /loyalty[-_\s]+(?:program|provider|club)|membership[-_\s]+program|frequent[-_\s]+flyer|программа\s*лояльност|бонусн\w*\s*програм|клуб\s*лояльност|название\s*программ/i;
export const LOYALTY_CARD_NUMBER =
  /loyalty[-_\s]*card[-_\s]*number|loyalty[-_\s]*number|member(?:ship)?[-_\s]*(?:card|number|id|no)|frequent[-_\s]*flyer[-_\s]*(?:number|no|id)|номер\s*участник|карта\s*лояльност|номер\s*(?:карты|карт)\s*лояльност|членск\w*\s*(?:карт|номер)|loyalty[-_\s]*card(?!\s*holder)/i;
export const LOYALTY_BARCODE = /\bbarcode\b|qr[-_\s]*code|qr[-_\s]*value|штрих[-_\s]*код|qr[-_\s]*код/i;
export const LOYALTY_EXPIRY =
  /loyalty[-_\s]*expir|membership[-_\s]*expir|срок\s*действ\w*\s*(?:карты\s*)?лояльност|годен\s*до.*лояльност/i;
/** Soft loyalty form cue — remaps bare card-number when present in the same field blob. */
export const LOYALTY_CONTEXT =
  /loyalty|member(?:ship)?|frequent[-_\s]*flyer|лояльност|бонусн\w*\s*програм|участник|членск/i;

export const VEHICLE_MAKE_MODEL =
  /make[-_\s\/]*model|vehicle[-_\s]*(?:make|model)|car[-_\s]*(?:make|model)|марка(?:\s*[\/&]\s*|\s+и\s+|\s+)?модель|модель\s*авто|make\s*(?:\/|&|and)\s*model/i;
export const VEHICLE_PLATE =
  /licen[cs]e[-_\s]*plate|\breg(?:istration)?[-_\s]*plate\b|\bplate[-_\s]*number\b|\bnumber[-_\s]*plate\b|\bvehicle[-_\s]*plate\b|госномер|гос\.?\s*номер|регистрационн\w*\s*знак|номерн\w*\s*знак/i;
export const VEHICLE_VIN =
  /\bvin\b|vehicle[-_\s]*identification|идентификационн\w*\s*номер\s*транспорт|вин[-_\s]*код/i;
export const VEHICLE_INSPECTION =
  /inspection[-_\s]*due|mot[-_\s]*due|mot[-_\s]*expiry|tech[-_\s]*inspection|техосмотр|техосмотр\w*\s*до|срок\s*техосмотр/i;
export const VEHICLE_POLICY =
  /insurance[-_\s]*policy|policy[-_\s]*number|полис|номер\s*полис|страховой\s*полис/i;
export const VEHICLE_INSURER =
  /\binsurer\b|insurance[-_\s]*company|страховщик|страховая\s*компани/i;
export const VEHICLE_INSURANCE_UNTIL =
  /insurance[-_\s]*(?:valid|expir)|policy[-_\s]*expir|(?:insurance|policy).{0,40}valid[-_\s]*until|valid[-_\s]*until.{0,40}(?:insurance|policy)|страховк\w*\s*до|полис\s*действ|действует\s*до.*страхов/i;

export const TRAVEL_TRANSPORT =
  /transport[-_\s]*type|travel[-_\s]*mode|mode[-_\s]*of[-_\s]*transport|тип\s*транспорт|вид\s*транспорт/i;
export const TRAVEL_CARRIER = /\bcarrier\b|airline|railway|operator|перевозчик|авиакомпани/i;
export const TRAVEL_TRIP =
  /flight[-_\s]*number|trip[-_\s]*number|train[-_\s]*number|voyage[-_\s]*number|рейс|номер\s*рейс|номер\s*поезд/i;
export const TRAVEL_DEPARTURE =
  /departure[-_\s]*(?:at|date|time)|depart(?:ure)?[-_\s]*datetime|дата\s*(?:и\s*время\s*)?отправлен|время\s*отправлен|отправлен/i;
export const TRAVEL_FROM =
  /(?:^|[^a-zа-яё])from(?:[^a-zа-яё]|$)|origin|departure[-_\s]*(?:city|airport|station)|откуда|пункт\s*отправлен|город\s*отправлен/i;
export const TRAVEL_TO =
  /(?:^|[^a-zа-яё])to(?:[^a-zа-яё]|$)|destination|arrival[-_\s]*(?:city|airport|station)|куда|пункт\s*назначен|город\s*прибыт/i;
export const TRAVEL_BOOKING_REF =
  /\bpnr\b|booking[-_\s]*(?:ref(?:erence)?|code|number)|reservation[-_\s]*(?:code|number|ref)|confirmation[-_\s]*(?:code|number)|код\s*бронирован|номер\s*брони|бронь/i;
export const TRAVEL_PASSENGERS = /passengers?|travellers?|пассажир/i;
export const TRAVEL_SEATS = /\bseats?\b|\bseat[-_\s]*number\b|места|место\b|номер\s*места/i;

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
