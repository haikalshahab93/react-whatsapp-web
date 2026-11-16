import React from "react";
import MessageBubble, { MessageActions } from "./MessageBubble";
import type { Message } from "../../lib/types";

interface LegacyProps {
  text?: string;
  time?: string;
  name?: string;
}

interface Props extends LegacyProps, MessageActions {
  message?: Message;
  currentUserId?: string;
  pending?: boolean;
}

function toLegacyMessage({ text = "", name, time }: LegacyProps): Message {
  return {
    _id: `legacy-${time || ""}-${text.slice(0, 12)}`,
    chat: "",
    sender: { _id: "me", name: name || "Me" },
    content: text,
    type: "text",
    createdAt: time ? new Date().toISOString() : new Date().toISOString(),
  };
}

const OwnMessageCard = ({ text, time, name, message, currentUserId = "", pending, ...actions }: Props) => {
  const resolved = message || toLegacyMessage({ text, time, name });
  return (
    <MessageBubble
      message={resolved}
      isOwn
      currentUserId={currentUserId}
      pending={pending}
      {...actions}
    />
  );
};

export default OwnMessageCard;
