import { useNavigation, useRoute } from "@react-navigation/native";
import React, { useState } from "react";

import { hasContactUsername, type Contact } from "../lib/contacts";
import { contactAddress, refreshContacts } from "../services/contacts";
import { useContacts } from "../store/contacts";
import { Button, Card, Empty, Field, IconButton, Screen, Segmented, Spinner, Text } from "../ui/components";
import { ContactRow, contactName } from "../ui/contactRow";
import { Sheet, toastError } from "../ui/extras";
import { space } from "../ui/theme";

export function ContactsScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { entries, ready, syncing, error } = useContacts();
  const [view, setView] = useState<"all" | "users" | "agents">(route.params?.view === "agents" ? "agents" : "all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [busy, setBusy] = useState(false);
  const needle = search.trim().toLowerCase();
  const contacts = Object.values(entries).filter(hasContactUsername).filter((contact) =>
    (view === "all" || contact.roles.includes(view === "agents" ? "agent" : "user")) &&
    (!needle || [contact.name, contact.address, contact.pubkey].some((value) => value?.toLowerCase().includes(needle))),
  ).sort((a, b) => b.lastAt - a.lastAt || a.id.localeCompare(b.id));
  const pay = async (contact: Contact) => {
    if (busy) return;
    setBusy(true);
    try {
      const address = await contactAddress(contact);
      setSelected(null);
      nav.navigate("Send", { input: address, contactId: contact.id });
    } catch (cause) { toastError(cause); }
    finally { setBusy(false); }
  };
  const open = (contact: Contact) => {
    if (busy) return;
    if (contact.roles.includes("agent") && contact.pubkey) setSelected(contact);
    else void pay(contact);
  };
  return <Screen back title="People" right={<IconButton name="refresh-cw" label="Sync private contacts" onPress={refreshContacts} />}>
    <Text variant="caption" muted>People and agents appear here after payments and swaps. Your index is encrypted for your wallet.</Text>
    <Field placeholder="Find a person or agent" accessibilityLabel="Search private contacts" value={search} onChangeText={setSearch} autoCorrect={false} />
    <Segmented value={view} onChange={setView} options={[{ value: "all", label: "All" }, { value: "users", label: "People" }, { value: "agents", label: "Agents" }]} />
    {!ready ? <Spinner label="Restoring your people…" /> : !contacts.length ? <Empty icon="users" title={needle ? "No matches" : "Your people will appear here"} body={needle ? "Try a different name or username." : "Pay someone or swap with an agent to keep them here for next time."} />
      : <Card style={{ paddingVertical: space.sm, gap: 0 }}>{contacts.map((contact) => <ContactRow key={contact.id} contact={contact} onPress={() => open(contact)} />)}</Card>}
    {busy && <Spinner label="Finding their payment username…" />}
    <Text variant="caption" muted>{error ?? (syncing ? "Syncing your encrypted index…" : "Private to your wallet")}</Text>
    <Sheet visible={!!selected} onClose={() => !busy && setSelected(null)} title={selected ? contactName(selected) : "Person"}>
      <Text variant="caption" muted>Check their agent profile for current offers and availability.</Text>
      <Button title="Add money or cash out" icon="briefcase" disabled={busy} onPress={() => {
        if (!selected?.pubkey) return;
        const pk = selected.pubkey;
        setSelected(null);
        nav.navigate("AgentProfile", { pk });
      }} />
      <Button title="Send money" kind="secondary" icon="arrow-up" loading={busy} onPress={() => { if (selected) void pay(selected); }} />
    </Sheet>
  </Screen>;
}
