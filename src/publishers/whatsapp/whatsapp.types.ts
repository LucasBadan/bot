export type SendWhatsappTextInput = {
  to: string;
  text: string;
};

export type SendWhatsappTextResult = {
  success: boolean;
  messageId?: string | null;
  raw?: unknown;
};

export type WhatsappCloudMessageResponse = {
  messaging_product?: string;
  contacts?: Array<{
    input?: string;
    wa_id?: string;
  }>;
  messages?: Array<{
    id?: string;
    message_status?: string;
  }>;
};
