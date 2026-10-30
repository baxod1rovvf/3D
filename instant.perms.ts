// Oila Uchun — InstantDB permissions. Only the two household members can see household data.
import type { InstantRules } from "@instantdb/core";

// Household ids the signed-in user belongs to (households.members link).
const MY_HOUSEHOLDS = "auth.ref('$user.households.id')";
const member = {
  bind: ["isMember", `auth.id != null && data.household_id in ${MY_HOUSEHOLDS}`],
  allow: {
    view: "isMember",
    create: "isMember",
    update: "isMember && newData.household_id == data.household_id",
    delete: "isMember",
  },
};

const rules = {
  // Deny anything not listed, and stop clients from inventing new attributes.
  $default: { allow: { $default: "false" } },
  attrs: { allow: { create: "false" } },

  households: {
    bind: [
      "isMember", "auth.id != null && auth.id in data.ref('members.id')",
      // Knowing the invite code lets you see and join a household that still has room (max 2).
      "hasCode", "auth.id != null && ruleParams.code == data.invite_code",
    ],
    allow: {
      view: "isMember || hasCode",
      create: "auth.id != null",
      update: "isMember || (hasCode && size(data.ref('members.id')) < 2)",
      delete: "false",
    },
  },

  profiles: {
    allow: {
      view: `auth.id == data.id || (data.household_id != null && data.household_id in ${MY_HOUSEHOLDS})`,
      create: "auth.id == data.id",
      update: "auth.id == data.id",
      delete: "false",
    },
  },

  grocery_items: member,
  meals: member,
  memories: member,
  tasks: member,

  activity: {
    bind: ["isMember", `auth.id != null && data.household_id in ${MY_HOUSEHOLDS}`],
    allow: {
      view: "isMember",
      create: "isMember && data.actor_id == auth.id",
      update: "false",
      delete: "false",
    },
  },

  // You read only your own notifications, and may only notify your partner — never yourself.
  notifications: {
    allow: {
      view: "auth.id == data.recipient_id",
      update: "auth.id == data.recipient_id",
      delete: "auth.id == data.recipient_id",
      create: `auth.id != null && data.actor_id == auth.id && data.recipient_id != auth.id && data.household_id in ${MY_HOUSEHOLDS}`,
    },
  },

  // Photos live under "<household_id>/..." and are visible only to that household.
  $files: {
    bind: ["inMyHousehold", `auth.id != null && ${MY_HOUSEHOLDS}.exists(h, data.path.startsWith(h + '/'))`],
    allow: {
      view: "inMyHousehold",
      create: "inMyHousehold",
      delete: "inMyHousehold",
    },
  },
} satisfies InstantRules;

export default rules;
