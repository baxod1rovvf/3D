// Oila Uchun — InstantDB schema. Push with: npx instant-cli@latest push all --app <APP_ID> (see README).
import { i } from "@instantdb/core";

const s = () => i.string().optional();
const scoped = () => i.string().indexed(); // household_id: the family key every record belongs to

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    // The household's id is the family's secret key (shared once via the family link).
    households: i.entity({
      name: i.string(),
      created_at: s(),
    }),
    // The two family members. No accounts: each phone remembers which profile it is.
    profiles: i.entity({
      household_id: scoped(),
      full_name: i.string(),
      role: i.string(), // "er" | "xotin"
      created_at: s(),
    }),
    grocery_items: i.entity({
      household_id: scoped(),
      name: i.string(),
      category: i.string(),
      quantity: s(),
      note: s(),
      status: i.string().indexed(), // "bor" | "kerak" | "olindi"
      urgent: i.boolean().optional(),
      added_by: s(),
      marked_by: s(),
      marked_at: s(),
      purchased_by: s(),
      purchased_at: s(),
      created_at: s(),
    }),
    meals: i.entity({
      household_id: scoped(),
      day_date: i.string().indexed(),
      slot: i.string(), // "nonushta" | "tushlik" | "kechki"
      title: i.string(),
      description: s(),
      ingredients: i.json().optional(),
      notes: s(),
      favorite: i.boolean().optional(),
      created_by: s(),
      created_at: s(),
    }),
    memories: i.entity({
      household_id: scoped(),
      title: i.string(),
      description: s(),
      memory_date: s(),
      photo_path: s(),
      created_by: s(),
      created_at: s(),
    }),
    tasks: i.entity({
      household_id: scoped(),
      title: i.string(),
      description: s(),
      assignee_id: s(),
      due_date: s(),
      priority: s(), // "past" | "orta" | "yuqori"
      done: i.boolean().optional(),
      completed_by: s(),
      completed_at: s(),
      remind_at: s(),
      reminded: i.boolean().optional(),
      created_by: s(),
      created_at: s(),
    }),
    activity: i.entity({
      household_id: scoped(),
      actor_id: i.string(),
      module: i.string(),
      text: i.string(),
      created_at: s(),
    }),
    notifications: i.entity({
      household_id: scoped(),
      recipient_id: i.string().indexed(),
      actor_id: i.string(),
      module: i.string(),
      text: i.string(),
      link: s(),
      read: i.boolean().optional(),
      created_at: s(),
    }),
  },
  links: {},
  rooms: {},
});

type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
