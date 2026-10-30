// Playful notification copy: build(type, data, rand) -> { title, body, fixed, tag, vibrate }. Plain script, no DOM.
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
  };

  // Last vibration value per type group; the rest of the pattern is shared.
  const BASE = [120, 60, 120, 200, 120, 60, 120, 60];
  function vibrateFor(type) {
    const last = type.startsWith("grocery") ? 260
      : (type.startsWith("task") ? 400 : (type.startsWith("meal") ? 600 : 200));
    return BASE.concat(last);
  }

  // Endings by the ACTOR's role: xotin -> suits the husband reading; er -> suits the wife.
  const FOR_HUSBAND = [
    "unga shokolad olib keling 🍫",
    "bugun unga gul sovg'a qiling 💐",
    "minnatdorchilik bildiring, u buni sezadi 🥰",
    "uni mehr bilan quchoqlang 🤗",
    "bugun kechki ovqatda unga yordam bering 🍽️",
    "unga yoqimli so'z ayting, kuni yaxshi o'tadi 💛",
    "unga shirin bir narsa olib keling 🍰",
    "bugun uni sevimli taomi bilan xursand qiling 😋",
  ];
  const FOR_WIFE = [
    "unga mazali choy damlab bering ☕",
    "unga rahmat ayting, juda xursand bo'ladi 🌷",
    "uni mehr bilan quchoqlang 🤗",
    "bugun unga shirinlik olib keling 🍰",
    "unga bugun biroz dam bering 🛋️",
    "unga yoqimli so'z ayting, kuni yaxshi o'tadi 💛",
    "kechki ovqatda unga yordam bering 🍽️",
    "unga bir tabassum hadya qiling 😊",
  ];
  const ENDINGS = { xotin: FOR_HUSBAND, er: FOR_WIFE };

  const ROLE = { xotin: "Xotiningiz", er: "Eringiz" };
  const SLOT = { nonushta: "Nonushta", tushlik: "Tushlik", kechki: "Kechki ovqat" };

  function fixedFor(type, d) {
    const who = ROLE[d.actorRole] || "Yaqiningiz";
    switch (type) {
      case "grocery_need": return who + " «" + d.item + "»ni kerak deb belgiladi";
      case "grocery_bought": return who + " «" + d.item + "»ni oldi ✅";
      case "task_done": return who + " «" + d.task + "»ni tugatdi";
      case "tasks_all_done": return who + " bugungi barcha ishlarni tugatdi: " + (d.tasks || []).join(", ");
      case "task_assigned": return "Sizga yangi ish: «" + d.task + "»";
      case "meal_added": return who + " menyuga «" + d.meal + "» qo'shdi";
      case "memory_added": return "Yangi xotira: «" + d.memory + "»";
      case "meal_reminder":
        return (SLOT[d.slot] || "Taom") + "ga " + d.hours + " soat qoldi" +
          (d.meal ? " — menyuda «" + d.meal + "»" : " — hali reja yo'q, nima pishiramiz? 🤔");
      case "test": return "Bildirishnomalar ishlayapti! 🎉";
      default: throw new Error("Unknown message type: " + type);
    }
  }

  function build(type, data, rand) {
    const d = data || {};
    const r = rand || Math.random;
    const fixed = fixedFor(type, d);
    let body = fixed;
    if (type !== "meal_reminder" && type !== "test") {
      const list = ENDINGS[d.actorRole] || FOR_WIFE;
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

  root.Messages = { build };
})(globalThis);
