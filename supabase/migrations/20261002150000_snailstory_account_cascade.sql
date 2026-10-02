-- Deleting an account deletes its Snail Story reminders and push
-- subscriptions, as the series privacy policy (snails.se/privacy.html)
-- promises. snailstory_saves already had the link. Sibling of
-- snailmageddon's 20261002150000_account_cascade.sql.
alter table public.snailstory_reminders
  add constraint snailstory_reminders_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.snailstory_push_subscriptions
  add constraint snailstory_push_subscriptions_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
