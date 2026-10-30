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

  // Endings per type, then by the ACTOR's role: xotin -> read by the husband; er -> read by the wife.
  const ENDINGS = {
    grocery_need: {
      xotin: ["do'kondan qaytishda olib keling 🥛", "yo'lda do'konga kirib o'tsangiz bo'ladi 🛒", "bugun olib kelsangiz, juda xursand bo'ladi 😊", "ro'yxatga qarab olib keling, rahmat oldindan 🙏", "unutmasdan olib keling, iltimos 💛", "olib kelsangiz, kechki ovqat zo'r chiqadi 🍲"],
      er: ["ro'yxatga qarab, o'zingiz xohlagan narsani qo'shib qo'ying 📝", "kerak bo'lsa, men olib kelaman deb ayting 💪", "do'konga birga chiqsak ham bo'ladi 🛒", "bugun do'kon vaqtida ochiq, ulgurib qoling 🕐", "yana nima kerakligini ham yozib qo'ying ✍️", "olib kelishga yordam beraman 🤝"],
    },
    grocery_bought: {
      xotin: ["rahmat aytishni unutmang 😊", "unga yaxshi so'z ayting 💛", "mehribonligi uchun minnatdorchilik bildiring 🌷", "bir chaqmoq choy bilan xursand qiling ☕", "arzimagan narsa, lekin e'tibor juda yoqadi 🥰", "unga bugun dam berib qo'ying 🛋️"],
      er: ["rahmat aytishni unutmang 😊", "unga yaxshi so'z ayting 💛", "kuchli yelkangiz uchun rahmat ayting 💪", "uni choy bilan siylang ☕", "mehnatini qadrlang, u buni sezadi 🥰", "bugun u bilan birga tushlik qiling 🍽️"],
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
      xotin: ["ishtaha bilan yeng 😋", "mazali bo'lishiga ishonamiz 🍲", "kerakli masalliqlarni olib kelib bering 🛒", "unga rahmat ayting 🌷", "kechki dasturxon yaxshi bo'ladi 🍽️", "hidi hozirdan keldi, shekilli 😄"],
      er: ["ishtaha bilan yeng 😋", "mazali bo'lishiga ishonamiz 🍲", "kerakli masalliqlarni birga olib kelsangiz bo'ladi 🛒", "unga rahmat ayting 🌷", "bugun dasturxon boy bo'ladi 🍽️", "hidi hozirdan keldi, shekilli 😄"],
    },
    memory_added: {
      xotin: ["birga ko'rib, tabassum qiling 😊", "yoqimli lahzalar eslansin 💛", "siz ham bir fotosurat qo'shing 📸", "bunday kunlar ko'proq bo'lsin 🌸", "ko'rib chiqib, yurak so'zlaringizni yozing 💌", "oilaviy xotiralar eng qimmat boylik 🏡"],
      er: ["birga ko'rib, tabassum qiling 😊", "yoqimli lahzalar eslansin 💛", "siz ham bir fotosurat qo'shing 📸", "bunday kunlar ko'proq bo'lsin 🌸", "ko'rib chiqib, yurak so'zlaringizni yozing 💌", "oilaviy xotiralar eng qimmat boylik 🏡"],
    },
  };

  const ROLE = { xotin: "Xotiningiz", er: "Eringiz" };
  const SLOT = { nonushta: "Nonushta", tushlik: "Tushlik", kechki: "Kechki ovqat" };

  function fixedFor(type, d) {
    const who = ROLE[d.actorRole] || "Yaqiningiz";
    const item = d.item || "narsa", task = d.task || "ish", meal = d.meal || "taom", memory = d.memory || "lahza";
    switch (type) {
      case "grocery_need": return who + " «" + item + "»ni kerak deb belgiladi";
      case "grocery_bought": return who + " «" + item + "»ni oldi ✅";
      case "task_done": return who + " «" + task + "»ni tugatdi";
      case "tasks_all_done": return who + " bugungi barcha ishlarni tugatdi: " + (d.tasks && d.tasks.length ? d.tasks.join(", ") : "ishlar");
      case "task_assigned": return "Sizga yangi ish: «" + task + "»";
      case "meal_added": return who + " menyuga «" + meal + "» qo'shdi";
      case "memory_added": return "Yangi xotira: «" + memory + "»";
      case "meal_reminder":
        return (SLOT[d.slot] || "Taom") + "ga " + (d.hours == null ? "bir necha" : d.hours) + " soat qoldi" +
          (d.meal ? " — menyuda «" + meal + "»" : " — hali reja yo'q, nima pishiramiz? 🤔");
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

  root.Messages = { build };
})(globalThis);
