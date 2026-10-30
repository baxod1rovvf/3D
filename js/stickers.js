// Grocery emoji stickers: name -> emoji (uz / ru / en). Plain script, no DOM.
(function (root) {
  const LIST = [
    { emoji: "🥕", words: ["sabzi", "морковь", "carrot"] },
    { emoji: "🥔", words: ["kartoshka", "картофель", "картошка", "potato"] },
    { emoji: "🧅", words: ["piyoz", "лук", "onion"] },
    { emoji: "🍅", words: ["pomidor", "помидор", "томат", "tomato"] },
    { emoji: "🥒", words: ["bodring", "огурец", "cucumber"] },
    { emoji: "🥬", words: ["karam", "капуста", "cabbage", "salat", "салат", "lettuce"] },
    { emoji: "🍆", words: ["baqlajon", "баклажан", "eggplant"] },
    { emoji: "🫑", words: ["qalampir", "перец", "pepper"] },
    { emoji: "🧄", words: ["sarimsoq", "чеснок", "garlic"] },
    { emoji: "🌽", words: ["makkajo'xori", "makkajoxori", "кукуруза", "corn"] },
    { emoji: "🎃", words: ["qovoq", "тыква", "pumpkin"] },
    { emoji: "🥦", words: ["brokkoli", "броколли", "брокколи", "broccoli"] },
    { emoji: "🍄", words: ["qo'ziqorin", "qoziqorin", "гриб", "mushroom"] },
    { emoji: "🌿", words: ["ko'kat", "kokat", "укроп", "петрушка", "zelen", "зелень", "parsley", "dill"] },
    { emoji: "🍎", words: ["olma", "яблоко", "apple"] },
    { emoji: "🍌", words: ["banan", "банан", "banana"] },
    { emoji: "🍇", words: ["uzum", "виноград", "grape"] },
    { emoji: "🍊", words: ["apelsin", "апельсин", "orange", "mandarin", "мандарин"] },
    { emoji: "🍋", words: ["limon", "лимон", "lemon"] },
    { emoji: "🍐", words: ["nok", "груша", "pear"] },
    { emoji: "🍑", words: ["o'rik", "orik", "абрикос", "персик", "shaftoli", "apricot", "peach"] },
    { emoji: "🍒", words: ["olcha", "вишня", "черешня", "gilos", "cherry"] },
    { emoji: "🍓", words: ["qulupnay", "клубника", "strawberry"] },
    { emoji: "🍉", words: ["tarvuz", "арбуз", "watermelon"] },
    { emoji: "🍈", words: ["qovun", "дыня", "melon"] },
    { emoji: "🍍", words: ["ananas", "ананас", "pineapple"] },
    { emoji: "🥭", words: ["mango", "манго"] },
    { emoji: "🥝", words: ["kivi", "киви", "kiwi"] },
    { emoji: "🥥", words: ["kokos", "кокос", "coconut"] },
    { emoji: "🍈", words: ["behi", "айва", "quince"] },
    { emoji: "🫐", words: ["krijovnik", "черника", "blueberry", "smorodina", "смородина"] },
    { emoji: "🥜", words: ["yong'oq", "yongoq", "арахис", "орех", "peanut", "walnut", "nut"] },
    { emoji: "🍯", words: ["asal", "мёд", "мед", "honey"] },
    { emoji: "🥛", words: ["sut", "молоко", "milk"] },
    { emoji: "🥣", words: ["qatiq", "йогурт", "yogurt", "kefir", "кефир", "smetana", "сметана"] },
    { emoji: "🧀", words: ["pishloq", "сыр", "cheese", "brynza", "брынза"] },
    { emoji: "🧈", words: ["sariyog'", "sariyog", "масло сливочное", "butter"] },
    { emoji: "🥚", words: ["tuxum", "яйцо", "яйца", "egg"] },
    { emoji: "🍨", words: ["muzqaymoq", "мороженое", "ice cream"] },
    { emoji: "🥩", words: ["go'sht", "gosht", "мясо", "говядина", "meat", "beef", "qo'y"] },
    { emoji: "🍗", words: ["tovuq", "курица", "chicken", "kurka", "индейка", "turkey"] },
    { emoji: "🐟", words: ["baliq", "рыба", "fish", "losos", "лосось"] },
    { emoji: "🦐", words: ["krevetka", "креветка", "shrimp"] },
    { emoji: "🌭", words: ["kolbasa", "колбаса", "sosiska", "сосиска", "sausage"] },
    { emoji: "🥓", words: ["bekon", "бекон", "bacon"] },
    { emoji: "🍞", words: ["non", "хлеб", "bread", "bulka", "булка", "батон"] },
    { emoji: "🥖", words: ["baget", "багет", "baguette"] },
    { emoji: "🥐", words: ["kruassan", "круассан", "croissant"] },
    { emoji: "🍪", words: ["pechenye", "печенье", "cookie", "biscuit"] },
    { emoji: "🍰", words: ["tort", "торт", "cake", "pirog", "пирог"] },
    { emoji: "🍫", words: ["shokolad", "шоколад", "chocolate"] },
    { emoji: "🍬", words: ["konfet", "конфета", "candy", "shirinlik"] },
    { emoji: "🍚", words: ["guruch", "рис", "rice"] },
    { emoji: "🍝", words: ["makaron", "макароны", "паста", "pasta", "spagetti"] },
    { emoji: "🌾", words: ["bug'doy uni", "мука", "flour", "grechka", "гречка", "yorma", "крупа"] },
    { emoji: "🫘", words: ["loviya", "фасоль", "bean", "no'xat", "noxat", "нут", "mosh", "чечевица"] },
    { emoji: "🍵", words: ["choy", "чай", "tea"] },
    { emoji: "☕", words: ["kofe", "кофе", "coffee"] },
    { emoji: "🧃", words: ["sharbat", "сок", "juice"] },
    { emoji: "💧", words: ["suv", "вода", "water"] },
    { emoji: "🥤", words: ["gazli", "cola", "кола", "fanta", "фанта", "pepsi", "лимонад", "limonad", "soda"] },
    { emoji: "🍺", words: ["pivo", "пиво", "beer"] },
    { emoji: "🍷", words: ["vino", "вино", "wine"] },
    { emoji: "🍬", words: ["shakar", "сахар", "sugar"] },
    { emoji: "🧂", words: ["tuz", "соль", "salt"] },
    { emoji: "🫒", words: ["yog'", "yog", "масло растительное", "oil", "zaytun", "оливки", "olive"] },
    { emoji: "🌶️", words: ["achchiq", "ziravor", "специи", "spice", "zira", "зира"] },
    { emoji: "🥫", words: ["konserva", "консервы", "canned", "ketchup", "кетчуп", "mayonez", "майонез"] },
    { emoji: "🧼", words: ["sovun", "мыло", "soap"] },
    { emoji: "🧴", words: ["shampun", "шампунь", "shampoo", "gel", "крем", "cream"] },
    { emoji: "🪥", words: ["tish pastasi", "зубная паста", "toothpaste", "tish cho'tka", "зубная щётка"] },
    { emoji: "🧻", words: ["qog'oz", "qogoz", "туалетная бумага", "tissue", "salfetka", "салфетка", "paper"] },
    { emoji: "🧽", words: ["gubka", "губка", "sponge", "idish yuvish", "моющее"] },
    { emoji: "🧺", words: ["kir yuvish", "порошок", "poroshok", "detergent", "yuvish kukuni", "stiralnyy"] },
    { emoji: "🗑️", words: ["axlat", "мусор", "trash", "paket", "пакет"] },
    { emoji: "🔋", words: ["batareya", "батарейка", "battery"] },
    { emoji: "💡", words: ["lampochka", "лампочка", "lamp", "bulb"] },
    { emoji: "🍼", words: ["pampers", "подгузник", "diaper", "bolalar ovqati", "детское питание"] },
    { emoji: "🐾", words: ["it ovqati", "корм", "pet food", "mushuk"] },
    { emoji: "💊", words: ["dori", "лекарство", "таблетка", "medicine", "pill", "vitamin", "витамин"] },
  ];

  // Category fallbacks when no word matches
  const CATEGORY = {
    sabzavot: "🥬",
    meva: "🍇",
    sut: "🥛",
    gosht: "🥩",
    non: "🍞",
    ichimlik: "🥤",
    uy: "🧴",
    boshqa: "🛒",
  };

  function normalize(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/[‘’ʻʼ`´]/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Flat index, longest word first
  const INDEX = [];
  LIST.forEach((g) => g.words.forEach((w) => INDEX.push({ w: normalize(w), emoji: g.emoji })));
  INDEX.sort((a, b) => b.w.length - a.w.length);

  function forName(name, category) {
    const n = normalize(name);
    if (n) {
      for (const it of INDEX) if (n.includes(it.w)) return it.emoji;
    }
    return CATEGORY[category] || "🛒";
  }

  root.Stickers = { forName, normalize, LIST };
})(globalThis);
