-- Track whether a lead notification email has been sent for a conversation
alter table widget_conversations
  add column if not exists lead_notified boolean not null default false;
