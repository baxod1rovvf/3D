// Oila Uchun — InstantDB permissions. There are no accounts: the app sends the family's
// secret key with every read and write (ruleParams.key), and a record is only reachable
// when its household_id equals that key. Without the family link, nothing can be read.
import type { InstantRules } from "@instantdb/core";

const HAS_KEY = "ruleParams.key == data.household_id";
const family = {
  allow: {
    view: HAS_KEY,
    create: HAS_KEY,
    update: `${HAS_KEY} && newData.household_id == data.household_id`,
    delete: HAS_KEY,
  },
};

const rules = {
  // Deny anything not listed, and stop clients from inventing new attributes.
  $default: { allow: { $default: "false" } },
  attrs: { allow: { create: "false" } },

  // A household's id is the key itself.
  households: {
    allow: {
      view: "ruleParams.key == data.id",
      create: "ruleParams.key == data.id",
      update: "ruleParams.key == data.id",
      delete: "false",
    },
  },
  profiles: { allow: { ...family.allow, delete: "false" } },
  grocery_items: family,
  meals: family,
  memories: family,
  tasks: family,
  activity: family,
  notifications: family,

  // Photos are stored under "<family key>/<random id>.jpg". Uploads cannot carry rule
  // parameters, so creating is open; seeing or deleting a photo needs the key.
  $files: {
    allow: {
      view: "data.path.startsWith(ruleParams.key + '/')",
      create: "true",
      delete: "data.path.startsWith(ruleParams.key + '/')",
    },
  },
} satisfies InstantRules;

export default rules;
