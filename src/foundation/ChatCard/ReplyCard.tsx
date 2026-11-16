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
  showSender?: boolean;
}

function toLegacyMessage({ text = "", name, time }: LegacyProps): Message {
  return {
    _id: `legacy-${time || ""}-${text.slice(0, 12)}`,
    chat: "",
    sender: { _id: "other", name: name || "User" },
    content: text,
    type: "text",
    createdAt: new Date().toISOString(),
  };
}

const ReplyMessageCard = ({ text, time, name, message, currentUserId = "", showSender, ...actions }: Props) => {
  const resolved = message || toLegacyMessage({ text, time, name });
  return (
    <MessageBubble
      message={resolved}
      isOwn={false}
      currentUserId={currentUserId}
      showSender={showSender ?? !!name}
      {...actions}
    />
  );
};

export default ReplyMessageCard;
