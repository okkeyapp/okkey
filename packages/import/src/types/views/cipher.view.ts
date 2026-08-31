import { LinkedIdType } from "../enums.js";

export class LoginUriView {
  uri?: string | null;
  match?: number | null;
}

export class LoginView {
  username?: string | null;
  password?: string | null;
  totp?: string | null;
  uris: LoginUriView[] | null = [];
  passwordRevisionDate?: Date;
  fido2Credentials: unknown[] = [];

  get canLaunch(): boolean {
    return (this.uris ?? []).some((u) => Boolean(u.uri));
  }

  static fromJSON(obj: Partial<LoginView> | null | undefined): LoginView {
    const view = new LoginView();
    if (!obj) {
      return view;
    }
    view.username = obj.username ?? null;
    view.password = obj.password ?? null;
    view.totp = obj.totp ?? null;
    view.uris = (obj.uris ?? []).map((u) => {
      const uri = new LoginUriView();
      uri.uri = typeof u === "string" ? u : u?.uri ?? null;
      return uri;
    });
    return view;
  }
}

export class FieldView {
  name = "";
  value = "";
  type = 0;
  linkedId?: LinkedIdType | null;
}

export class CardView {
  cardholderName?: string | null;
  brand?: string | null;
  number?: string | null;
  expMonth?: string | null;
  expYear?: string | null;
  code?: string | null;

  static getCardBrandByPatterns(number: string | null | undefined): string | null {
    if (!number) {
      return null;
    }
    const digits = number.replace(/\s/g, "");
    if (/^4/.test(digits)) {
      return "Visa";
    }
    if (/^5[1-5]/.test(digits)) {
      return "Mastercard";
    }
    if (/^3[47]/.test(digits)) {
      return "Amex";
    }
    return null;
  }

  static fromJSON(obj: Partial<CardView> | null | undefined): CardView {
    const view = new CardView();
    if (!obj) {
      return view;
    }
    Object.assign(view, obj);
    return view;
  }
}

export class IdentityView {
  title?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  username?: string | null;
  company?: string | null;
  ssn?: string | null;
  passportNumber?: string | null;
  licenseNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  address1?: string | null;
  address2?: string | null;
  address3?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;

  static fromJSON(obj: Partial<IdentityView> | null | undefined): IdentityView {
    const view = new IdentityView();
    if (!obj) {
      return view;
    }
    Object.assign(view, obj);
    return view;
  }
}

export class SecureNoteView {
  type = 0;
}

export class SshKeyView {
  privateKey?: string | null;
  publicKey?: string | null;
  keyFingerprint?: string | null;

  static fromJSON(obj: Partial<SshKeyView> | null | undefined): SshKeyView {
    const view = new SshKeyView();
    if (!obj) {
      return view;
    }
    Object.assign(view, obj);
    return view;
  }
}

export class AttachmentView {
  id?: string | null;
  url?: string | null;
  fileName?: string | null;
  size?: string | null;
  sizeName?: string | null;
  key?: string | null;

  static fromJSON(obj: Partial<AttachmentView> | null | undefined): AttachmentView {
    const view = new AttachmentView();
    if (!obj) {
      return view;
    }
    Object.assign(view, obj);
    return view;
  }
}

export class CipherView {
  id = "";
  organizationId?: string | null;
  folderId?: string | null;
  name = "";
  notes?: string | null;
  type = 1;
  favorite = false;
  login: LoginView | null = new LoginView();
  identity = new IdentityView();
  card = new CardView();
  secureNote = new SecureNoteView();
  sshKey = new SshKeyView();
  attachments: AttachmentView[] = [];
  fields: FieldView[] = [];
  collectionIds: string[] = [];
  reprompt = 0;
  archivedDate?: Date;

  static fromJSON(obj: Record<string, unknown> | null | undefined): CipherView | null {
    if (!obj) {
      return null;
    }
    const view = new CipherView();
    view.id = typeof obj.id === "string" ? obj.id : "";
    view.organizationId = typeof obj.organizationId === "string" ? obj.organizationId : null;
    view.folderId = typeof obj.folderId === "string" ? obj.folderId : null;
    view.name = typeof obj.name === "string" ? obj.name : "";
    view.notes = typeof obj.notes === "string" ? obj.notes : null;
    view.type = typeof obj.type === "number" ? obj.type : 1;
    view.favorite = Boolean(obj.favorite);
    view.fields = Array.isArray(obj.fields)
      ? obj.fields.map((field) => {
          const f = new FieldView();
          if (field && typeof field === "object") {
            const raw = field as Record<string, unknown>;
            f.name = typeof raw.name === "string" ? raw.name : "";
            f.value = typeof raw.value === "string" ? raw.value : "";
            f.type = typeof raw.type === "number" ? raw.type : 0;
          }
          return f;
        })
      : [];
    view.attachments = Array.isArray(obj.attachments)
      ? obj.attachments.map((a) => AttachmentView.fromJSON(a as Partial<AttachmentView>))
      : [];

    switch (view.type) {
      case 3:
        view.card = CardView.fromJSON(obj.card as Partial<CardView>);
        break;
      case 4:
        view.identity = IdentityView.fromJSON(obj.identity as Partial<IdentityView>);
        break;
      case 2:
        view.secureNote = new SecureNoteView();
        break;
      case 5:
        view.sshKey = SshKeyView.fromJSON(obj.sshKey as Partial<SshKeyView>);
        break;
      default:
        view.login = LoginView.fromJSON(obj.login as Partial<LoginView>);
        break;
    }
    return view;
  }
}
