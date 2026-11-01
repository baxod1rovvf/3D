// Playful notification copy: build(type, data, rand) -> { title, body, fixed, tag, vibrate } (read by the recipient),
// and activity(type, data) -> third-person line for the shared feed (or null). Plain script, no DOM.
(function (root) {
  const TITLES = {
    grocery_need: "🛒 Ro'zg'or",
    grocery_bought: "🛍️ Xarid",
    task_done: "✨ Uy ishlari",
    tasks_all_done: "💐 Uy ishlari",
    task_assigned: "📋 Yangi ish",
    meal_added: "🍽️ Menyu",
    memory_added: "📸 Xotira",
    meal_reminder: "🍳 Taom vaqti",
    test: "🔔 Sinov",
    gift_wish: "🎁 Xohish",
  };

  // Last vibration value per type group; the rest of the pattern is shared.
  const BASE = [120, 60, 120, 200, 120, 60, 120, 60];
  function vibrateFor(type) {
    const last = type.startsWith("grocery") ? 260
      : (type.startsWith("task") ? 400 : (type.startsWith("meal") ? 600 : 200));
    return BASE.concat(last);
  }

  // Endings per type, then by the ACTOR's role: xotin -> read by the husband; er -> read by the wife.
  const ENDINGS = {
    grocery_need: {
      xotin: ["do'kondan qaytishda olib keling 🥛", "yo'lda do'konga kirib o'tsangiz bo'ladi 🛒", "bugun olib kelsangiz, juda xursand bo'ladi 😊", "ro'yxatga qarab olib keling, rahmat oldindan 🙏", "unutmasdan olib keling, iltimos 💛", "olib kelsangiz, kechki ovqat zo'r chiqadi 🍲"],
      er: ["u bilan birga ro'yxatni ko'rib chiqing 📝", "unga yana nima kerakligini ayting 💬", "kerak bo'lsa, siz ham qo'shib qo'ying ✍️", "do'konga u bilan birga borsangiz ham bo'ladi 🛒", "e'tibori uchun unga rahmat ayting 🌷", "ro'yxatni to'ldirishga yordam bering 🤝"],
    },
    grocery_bought: {
      xotin: ["rahmat aytishni unutmang 😊", "unga yaxshi so'z ayting 💛", "mehribonligi uchun minnatdorchilik bildiring 🌷", "bir piyola choy bilan xursand qiling ☕", "arzimagan narsa, lekin e'tibor juda yoqadi 🥰", "unga bugun dam berib qo'ying 🛋️"],
      er: ["rahmat aytishni unutmang 😊", "unga yaxshi so'z ayting 💛", "kuchli yelkasi uchun rahmat ayting 💪", "uni choy bilan siylang ☕", "mehnatini qadrlang, u buni sezadi 🥰", "bugun u bilan birga tushlik qiling 🍽️"],
    },
    task_done: {
      xotin: ["zo'r! 👏", "rahmat deb qo'ying 🌷", "baraka topsin, uy yanada toza 🏡", "bir og'iz maqtov ayting, kuni yaxshi bo'ladi 💛", "uy juda yoqimli bo'ldi ✨", "unga bir stakan choy damlab bering ☕"],
      er: ["zo'r! 👏", "rahmat deb qo'ying 🌷", "qo'li dard ko'rmasin 💪", "bir og'iz maqtov ayting, kuni yaxshi bo'ladi 💛", "uy yanada ozoda ✨", "unga bir stakan choy damlab bering ☕"],
    },
    tasks_all_done: {
      xotin: ["unga shokolad olib keling 🍫", "bugun unga gul sovg'a qiling 💐", "bugun kechki ovqatni o'zingiz tayyorlang 🍳", "uni mehr bilan quchoqlang 🤗", "u juda toliqqan bo'lishi mumkin, dam bering 🛋️", "unga chuqur rahmat aytishni unutmang 🙏", "kechqurun u bilan sayr qilib keling 🌙", "bugun u uchun sevimli shirinlik oling 🍰"],
      er: ["unga mazali choy damlab bering ☕", "bugun unga kechki ovqatda yordam bering 🍽️", "uni mehr bilan quchoqlang 🤗", "qo'li dard ko'rmasin deb qo'ying 💪", "u charchagan bo'lishi mumkin, dam bering 🛋️", "unga chuqur rahmat aytishni unutmang 🙏", "kechqurun u bilan birga film ko'ring 🎬", "bugun u uchun biror shirinlik oling 🍰"],
    },
    task_assigned: {
      xotin: ["vaqti topilsa, bajarib qo'ying 🙏", "bajarsangiz juda xursand bo'ladi 😊", "tugatgach, belgilab qo'yishni unutmang ✅", "kerak bo'lsa, unga savol bering 💬", "birga qilsangiz, tezroq bitadi 🤝", "uddalaysiz, ishonamiz 💪"],
      er: ["vaqti topilsa, bajarib qo'ying 🙏", "bajarsangiz juda xursand bo'ladi 😊", "tugatgach, belgilab qo'yishni unutmang ✅", "kerak bo'lsa, unga savol bering 💬", "birga qilsangiz, tezroq bitadi 🤝", "uddalaysiz, ishonamiz 💪"],
    },
    meal_added: {
      xotin: ["ishtaha bilan yeng 😋", "mazali bo'lishiga ishonamiz 🍲", "kerakli masalliqlarni olib kelib bering 🛒", "unga rahmat ayting 🌷", "dasturxon yanada to'kin bo'ladi 🍽️", "hidi hozirdan keldi, shekilli 😄"],
      er: ["ishtaha bilan yeng 😋", "mazali bo'lishiga ishonamiz 🍲", "masalliqlarni u bilan birga olib kelsangiz bo'ladi 🛒", "unga rahmat ayting 🌷", "dasturxon boy bo'ladi 🍽️", "hidi hozirdan keldi, shekilli 😄"],
    },
    memory_added: {
      xotin: ["birga ko'rib, tabassum qiling 😊", "yoqimli lahzalar eslansin 💛", "siz ham bir fotosurat qo'shing 📸", "bunday kunlar ko'proq bo'lsin 🌸", "ko'rib chiqib, unga iliq so'z ayting 💌", "oilaviy xotiralar eng qimmat boylik 🏡"],
      er: ["birga ko'rib, tabassum qiling 😊", "yoqimli lahzalar eslansin 💛", "siz ham bir fotosurat qo'shing 📸", "bunday kunlar ko'proq bo'lsin 🌸", "ko'rib chiqib, unga iliq so'z ayting 💌", "oilaviy xotiralar eng qimmat boylik 🏡"],
    },
  };

  const ROLE = { xotin: "Xotiningiz", er: "Eringiz" };
  // Meal slots: name (also lowercased in lists) and dative ("…ga") form.
  const SLOT = {
    nonushta: { name: "Nonushta", dat: "Nonushtaga" },
    tushlik: { name: "Tushlik", dat: "Tushlikka" },
    kechki: { name: "Kechki ovqat", dat: "Kechki ovqatga" },
  };

  // " (Juma, kechki ovqat)" when the day and/or slot are known.
  function mealWhen(d) {
    const slot = d.slotName || (SLOT[d.slot] && SLOT[d.slot].name);
    const parts = [d.day, slot && slot.toLowerCase()].filter(Boolean);
    return parts.length ? " (" + parts.join(", ") + ")" : "";
  }

  // Grocery batches: "Sut, Non, Tuxum" (up to 6 names) + " va yana N ta".
  const LIST_MAX = 6;
  function groceryItems(d) {
    const items = (d.items && d.items.length ? d.items : [d.item || "narsa"]).map(String);
    const shown = items.slice(0, LIST_MAX).join(", ");
    return { items, list: items.length > LIST_MAX ? shown + " va yana " + (items.length - LIST_MAX) + " ta" : shown };
  }
  // "{who} [yana] «Sut»ni …" for one product, "{who} [yana] 3 ta mahsulotni …: Sut, Non, Tuxum" for several.
  function groceryText(who, d, verbOne, verbMany) {
    const g = groceryItems(d);
    const yana = d.again ? " yana" : "";
    return g.items.length === 1
      ? who + yana + " «" + g.items[0] + "»ni " + verbOne
      : who + yana + " " + g.items.length + " ta mahsulotni " + verbMany + ": " + g.list;
  }

  // Text the RECIPIENT reads (push and bell): the actor is named by role, "you" is the reader.
  function fixedFor(type, d) {
    const who = ROLE[d.actorRole] || "Yaqiningiz";
    const item = d.item || "narsa", task = d.task || "ish", meal = d.meal || "taom", memory = d.memory || "lahza";
    switch (type) {
      case "grocery_need": return groceryText(who, d, "kerak deb belgiladi", "kerak deb belgiladi");
      case "grocery_bought": return groceryText(who, d, "oldi ✅", "oldi ✅");
      case "task_done": return who + " «" + task + "»ni tugatdi";
      case "tasks_all_done": return who + " bugungi barcha ishlarni tugatdi" + (d.tasks && d.tasks.length ? ": " + d.tasks.join(", ") : "");
      case "task_assigned": return who + " sizga yangi ish berdi: «" + task + "»";
      case "meal_added": return who + " menyuga «" + meal + "» qo'shdi" + mealWhen(d);
      case "memory_added": return "Yangi xotira: «" + memory + "»";
      case "meal_reminder":
        return (SLOT[d.slot] ? SLOT[d.slot].dat : "Taomga") + " " + (d.hours == null ? "bir necha" : d.hours) + " soat qoldi" +
          (d.meal ? " — menyuda «" + meal + "»" : " — hali reja yo'q, nima pishiramiz? 🤔");
      case "test": return "Bildirishnomalar ishlayapti! 🎉";
      case "gift_wish": {
        // A sweet request in the family's own words: "Dadajonisi, rosa banan yegim kelyapdi…"
        const dear = d.actorRole === "er" ? "Oyijonisi" : "Dadajonisi";
        const want = d.verb === "ich" ? "ichgim" : "yegim";
        return dear + ", rosa " + String(d.gift || "shirinlik").toLowerCase() + " " + want + " kelyapdi. Qaytishizda olib keliiing 🥺";
      }
      default: throw new Error("Unknown message type: " + type);
    }
  }

  // Shared home feed, seen by BOTH people: third person, the actor by first name (d.actor).
  // Returns null for types that have no feed entry (test, meal_reminder).
  function activity(type, data) {
    const d = data || {};
    const who = d.actor || "Kimdir";
    const item = d.item || "narsa", task = d.task || "ish", meal = d.meal || "taom", memory = d.memory || "lahza";
    switch (type) {
      case "grocery_need": return groceryText(who, d, "kerak deb belgiladi", "kerak deb belgiladi");
      case "grocery_bought": return groceryText(who, d, "oldi ✅", "oldi ✅");
      case "grocery_added": return who + " yangi mahsulot qo'shdi: «" + item + "»";
      case "task_done": return who + " «" + task + "»ni tugatdi";
      case "tasks_all_done": return who + " bugungi barcha ishlarni tugatdi 💐";
      case "task_assigned": return who + " yangi ish qo'shdi: «" + task + "»" + (d.assignee ? " — " + d.assignee + " uchun" : "");
      case "task_added": return who + " yangi ish qo'shdi: «" + task + "»";
      case "meal_added": return who + " menyuga «" + meal + "» qo'shdi" + mealWhen(d);
      case "memory_added": return who + " yangi xotira qo'shdi: «" + memory + "»";
      case "gift_wish": return who + " " + String(d.gift || "shirinlik").toLowerCase() + " so'radi 🎁";
      case "meal_reminder": case "test": return null;
      default: throw new Error("Unknown activity type: " + type);
    }
  }

  function build(type, data, rand) {
    const d = data || {};
    const r = rand || Math.random;
    const fixed = fixedFor(type, d);
    let body = fixed;
    if (type !== "meal_reminder" && type !== "test" && type !== "gift_wish") {
      const byRole = ENDINGS[type];
      const list = byRole[d.actorRole] || byRole.er;
      body = fixed + " — " + list[Math.floor(r() * list.length)];
    }
    return {
      title: TITLES[type],
      body,
      fixed,
      tag: type === "meal_reminder" && d.slot ? type + "-" + d.slot : type,
      vibrate: vibrateFor(type),
    };
  }

  root.Messages = { build, activity };
})(globalThis);
