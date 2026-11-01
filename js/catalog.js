// Ro'zg'or catalogue: categories with common products (each with its own emoji), and the
// "Xohishlar" treats a partner can ask for. Plain script: attaches Catalog to globalThis.
(function (root) {
  const p = (name, emoji) => ({ name, emoji });

  const CATEGORIES = [
    { id: "sabzavot", name: "Sabzavotlar", emoji: "🥬", products: [
      p("Kartoshka", "🥔"), p("Piyoz", "🧅"), p("Sabzi", "🥕"), p("Pomidor", "🍅"), p("Bodring", "🥒"),
      p("Karam", "🥬"), p("Sarimsoq", "🧄"), p("Bulg'or qalampiri", "🫑"), p("Achchiq qalampir", "🌶️"),
      p("Baqlajon", "🍆"), p("Qovoq", "🎃"), p("Lavlagi", "🍠"), p("Turp", "🌱"), p("Ko'kat", "🌿"),
      p("Kashnich", "🌿"), p("Shivit", "🌱"), p("Makkajo'xori", "🌽"), p("Brokkoli", "🥦"), p("Qo'ziqorin", "🍄"),
    ] },
    { id: "meva", name: "Mevalar", emoji: "🍓", products: [
      p("Olma", "🍎"), p("Nok", "🍐"), p("Banan", "🍌"), p("Apelsin", "🍊"), p("Mandarin", "🍊"),
      p("Limon", "🍋"), p("Uzum", "🍇"), p("Qulupnay", "🍓"), p("Tarvuz", "🍉"), p("Qovun", "🍈"),
      p("Shaftoli", "🍑"), p("Gilos", "🍒"), p("Anor", "❤️"), p("Kivi", "🥝"), p("Ananas", "🍍"),
      p("Mango", "🥭"), p("Xurmo", "🌴"), p("Yong'oq", "🌰"), p("Mayiz", "🍇"), p("Avokado", "🥑"),
    ] },
    { id: "sut", name: "Sut mahsulotlari", emoji: "🧀", products: [
      p("Sut", "🥛"), p("Qatiq", "🥛"), p("Kefir", "🥛"), p("Qaymoq", "🍶"), p("Smetana", "🥣"),
      p("Tvorog", "🧀"), p("Pishloq", "🧀"), p("Sariyog'", "🧈"), p("Tuxum", "🥚"), p("Yogurt", "🥣"),
      p("Suzma", "🥣"), p("Muzqaymoq", "🍦"),
    ] },
    { id: "gosht", name: "Go'sht mahsulotlari", emoji: "🍖", products: [
      p("Mol go'shti", "🥩"), p("Qo'y go'shti", "🍖"), p("Tovuq", "🍗"), p("Qiyma", "🥩"), p("Baliq", "🐟"),
      p("Kolbasa", "🌭"), p("Sosiska", "🌭"), p("Jigar", "🥩"), p("Qazi", "🍖"), p("Kurka", "🦃"),
    ] },
    { id: "non", name: "Non va un mahsulotlari", emoji: "🥖", products: [
      p("Non", "🫓"), p("Lavash", "🫓"), p("Baton", "🥖"), p("Un", "🌾"), p("Guruch", "🍚"),
      p("Makaron", "🍝"), p("Grechka", "🌾"), p("Mosh", "🫘"), p("No'xat", "🫘"), p("Loviya", "🫘"),
      p("Suli yormasi", "🥣"), p("Pechenye", "🍪"), p("Tort", "🎂"), p("Bulochka", "🥐"),
    ] },
    { id: "ichimlik", name: "Ichimliklar", emoji: "🧃", products: [
      p("Choy", "🍵"), p("Qahva", "☕"), p("Ichimlik suvi", "💧"), p("Mineral suv", "🫧"), p("Sharbat", "🧃"),
      p("Kola", "🥤"), p("Kompot", "🍹"), p("Limonad", "🍋"), p("Kakao", "🍫"),
    ] },
    { id: "uy", name: "Uy-ro'zg'or buyumlari", emoji: "🧴", products: [
      p("Idish yuvish vositasi", "🧽"), p("Kir yuvish kukuni", "🫧"), p("Gubka", "🧽"), p("Axlat paketi", "🗑️"),
      p("Salfetka", "🧻"), p("Qog'oz sochiq", "🧻"), p("Folga", "📜"), p("Gugurt", "🔥"), p("Lampochka", "💡"),
      p("Batareya", "🔋"), p("Oqartiruvchi", "🧴"), p("Pol yuvish vositasi", "🧹"), p("Kir yumshatgich", "🌸"),
      p("Hojatxona tozalagich", "🚽"),
    ] },
    { id: "gigiyena", name: "Gigiyena vositalari", emoji: "🧼", products: [
      p("Sovun", "🧼"), p("Shampun", "🧴"), p("Tish pastasi", "🪥"), p("Tish cho'tkasi", "🪥"),
      p("Hojatxona qog'ozi", "🧻"), p("Dezodorant", "🧴"), p("Ustara", "🪒"), p("Paxta", "☁️"),
      p("Ho'l salfetka", "🧻"), p("Gigiyenik prokladka", "🌸"), p("Qo'l kremi", "🧴"),
      p("Bolalar tagligi (pampers)", "👶"), p("Bolalar ho'l salfetkasi", "👶"), p("Bolalar kremi", "🧴"),
      p("Bolalar shampuni", "🛁"), p("Bolalar sovuni", "🧼"), p("Bolalar kukuni (prisipka)", "👶"),
      p("Bolalar ovqati (smes)", "🍼"), p("So'rg'ich", "🍼"), p("Bolalar shishasi", "🍼"),
    ] },
    { id: "boshqa", name: "Boshqalar", emoji: "🛒", products: [
      p("Shakar", "🍬"), p("Tuz", "🧂"), p("O'simlik yog'i", "🫒"), p("Ziravorlar", "🌶️"), p("Asal", "🍯"),
      p("Murabbo", "🍓"), p("Ketchup", "🍅"), p("Mayonez", "🥫"), p("Konserva", "🥫"), p("Shokolad", "🍫"),
      p("Konfet", "🍬"), p("Xamirturush", "🧁"),
    ] },
  ];

  // Treats for "Xohishlar": verb "ye" (eat) or "ich" (drink) picks yegim / ichgim.
  const GIFTS = [
    { name: "Banan", emoji: "🍌", verb: "ye" }, { name: "Mandarin", emoji: "🍊", verb: "ye" },
    { name: "Apelsin", emoji: "🍊", verb: "ye" }, { name: "To'rt", emoji: "🎂", verb: "ye" },
    { name: "Cola", emoji: "🥤", verb: "ich" }, { name: "Pista", emoji: "🥜", verb: "ye" },
    { name: "Shokolad", emoji: "🍫", verb: "ye" }, { name: "Muzqaymoq", emoji: "🍦", verb: "ye" },
    { name: "Konfet", emoji: "🍬", verb: "ye" }, { name: "Pechenye", emoji: "🍪", verb: "ye" },
    { name: "Chips", emoji: "🍟", verb: "ye" }, { name: "Ponchik", emoji: "🍩", verb: "ye" },
    { name: "Pirojniy", emoji: "🧁", verb: "ye" }, { name: "Qulupnay", emoji: "🍓", verb: "ye" },
    { name: "Uzum", emoji: "🍇", verb: "ye" }, { name: "Anor", emoji: "❤️", verb: "ye" },
    { name: "Ananas", emoji: "🍍", verb: "ye" }, { name: "Pitsa", emoji: "🍕", verb: "ye" },
    { name: "Burger", emoji: "🍔", verb: "ye" }, { name: "Lavash", emoji: "🌯", verb: "ye" },
    { name: "Sharbat", emoji: "🧃", verb: "ich" }, { name: "Qahva", emoji: "☕", verb: "ich" },
    { name: "Milkshake", emoji: "🥤", verb: "ich" }, { name: "Yong'oq", emoji: "🌰", verb: "ye" },
  ];

  const norm = (s) => String(s || "").toLowerCase().replace(/[‘’ʻʼ`´]/g, "'").replace(/\s+/g, " ").trim();
  const byName = new Map();
  CATEGORIES.forEach((c) => c.products.forEach((x) => byName.set(norm(x.name), { ...x, category: c.id })));

  root.Catalog = {
    CATEGORIES,
    GIFTS,
    /** The catalogue entry for an exact product name (any case/apostrophe), or null. */
    find: (name) => byName.get(norm(name)) || null,
    category: (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1],
  };
})(globalThis);
