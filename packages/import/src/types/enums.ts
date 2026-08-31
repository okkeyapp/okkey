export enum CipherType {
  Login = 1,
  SecureNote = 2,
  Card = 3,
  Identity = 4,
  SshKey = 5,
}

export enum FieldType {
  Text = 0,
  Hidden = 1,
  Boolean = 2,
  Linked = 3,
}

export enum SecureNoteType {
  Generic = 0,
}

export enum CipherRepromptType {
  None = 0,
}

export enum LinkedIdType {
  Username = 100,
  Password = 101,
}
