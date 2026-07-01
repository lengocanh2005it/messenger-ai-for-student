export const MESSAGE_SENDER = Symbol('MESSAGE_SENDER');

export interface MessageSenderPort {
  sendTextViaPsid(params: {
    psid: string;
    text: string;
    messageType: string;
    userId?: number;
  }): Promise<void>;
}
