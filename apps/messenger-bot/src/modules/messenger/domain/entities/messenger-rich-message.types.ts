export interface MessengerPostbackButton {
  type: 'postback';
  title: string;
  payload: string;
}

export interface MessengerGenericElement {
  title: string;
  subtitle?: string;
  buttons?: MessengerPostbackButton[];
}

export interface MessengerGenericFollowUp {
  kind: 'generic';
  messageType: string;
  elements: MessengerGenericElement[];
}

export interface MessengerButtonFollowUp {
  kind: 'button';
  messageType: string;
  text: string;
  buttons: MessengerPostbackButton[];
}

export type MessengerRichFollowUp =
  | MessengerGenericFollowUp
  | MessengerButtonFollowUp;
