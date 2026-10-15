import React from "react";
import type { Contact } from "../lib/contacts";
import { shortRecipient } from "../lib/sendFlow";
import { Avatar, Badge, Row } from "./components";

export function contactName(contact: Contact): string {
  return contact.name || (contact.address?.includes("@") ? `@${contact.address.split("@")[0]}` : shortRecipient(contact.address ?? contact.pubkey ?? "Person"));
}

export function ContactRow({ contact, onPress }: { contact: Contact; onPress?: () => void }) {
  const agent = contact.roles.includes("agent");
  return <Row
    left={<Avatar pk={contact.pubkey ?? contact.address ?? contact.id} name={contactName(contact)} size={36} />}
    title={contactName(contact)}
    subtitle={contact.address ? shortRecipient(contact.address) : agent ? "Agent you've used" : "Someone you've swapped with"}
    right={agent ? <Badge label={contact.roles.includes("user") ? "Person · Agent" : "Agent"} tone="success" /> : undefined}
    chevron onPress={onPress}
  />;
}
