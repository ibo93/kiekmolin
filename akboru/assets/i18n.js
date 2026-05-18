/* AK BORU PROFIL — i18n dictionary + language switcher
   Supported: tr (Türkçe), de (Deutsch), en (English), ar (العربية / RTL)
*/

const LANGS = {
  tr: { label: "Türkçe", short: "TR", dir: "ltr" },
  de: { label: "Deutsch", short: "DE", dir: "ltr" },
  en: { label: "English", short: "EN", dir: "ltr" },
  ar: { label: "العربية", short: "AR", dir: "rtl" }
};

const DICT = {
  /* -------------------- NAV / COMMON -------------------- */
  "nav.home":         { tr: "Ana Sayfa",   de: "Start",        en: "Home",        ar: "الرئيسية" },
  "nav.products":     { tr: "Ürünler",     de: "Produkte",     en: "Products",    ar: "المنتجات" },
  "nav.engineering":  { tr: "Mühendislik", de: "Engineering",  en: "Engineering", ar: "الهندسة" },
  "nav.facilities":   { tr: "Tesisler",    de: "Anlagen",      en: "Facilities",  ar: "المنشآت" },
  "nav.company":      { tr: "Şirket",      de: "Unternehmen",  en: "Company",     ar: "الشركة" },
  "nav.contact":      { tr: "İletişim",    de: "Kontakt",      en: "Contact",     ar: "اتصل بنا" },
  "nav.quote":        { tr: "Teklif İste", de: "Angebot anfragen", en: "Request Quote", ar: "اطلب عرض سعر" },

  "cta.viewSpecs":    { tr: "Teknik Verileri Gör", de: "Spezifikationen ansehen", en: "View Specifications", ar: "عرض المواصفات" },
  "cta.exploreSpecs": { tr: "Spesifikasyonları İncele", de: "Spezifikationen erkunden", en: "Explore Specifications", ar: "استكشف المواصفات" },
  "cta.downloadCad":  { tr: "CAD İndir",   de: "CAD herunterladen", en: "Download CAD", ar: "تحميل ملف CAD" },
  "cta.viewDataSheet":{ tr: "Veri Sayfasını Gör", de: "Datenblatt ansehen", en: "View Data Sheet", ar: "عرض ورقة البيانات" },
  "cta.learnMore":    { tr: "Daha Fazla Bilgi", de: "Mehr erfahren", en: "Learn More", ar: "اعرف المزيد" },

  "tag.inStock":      { tr: "Stokta", de: "Auf Lager", en: "In Stock", ar: "متوفر" },
  "tag.ready":        { tr: "Hazır",  de: "Bereit",    en: "Ready",    ar: "جاهز" },
  "tag.online":       { tr: "ÇEVRİMİÇİ", de: "ONLINE", en: "ONLINE",  ar: "متصل" },
  "tag.optimal":      { tr: "OPTİMAL", de: "OPTIMAL",  en: "OPTIMAL", ar: "مثالي" },

  /* -------------------- FOOTER -------------------- */
  "footer.tagline":   { tr: "© 2024 AK BORU PROFİL. HASSAS MÜHENDİSLİK ENDÜSTRİYEL ÇÖZÜMLER.",
                        de: "© 2024 AK BORU PROFIL. PRÄZISIONS-INDUSTRIELÖSUNGEN.",
                        en: "© 2024 AK BORU PROFIL. PRECISION ENGINEERED INDUSTRIAL SOLUTIONS.",
                        ar: "© 2024 AK BORU PROFIL. حلول صناعية مهندسة بدقة." },
  "footer.privacy":   { tr: "Gizlilik Politikası", de: "Datenschutz",     en: "Privacy Policy",    ar: "سياسة الخصوصية" },
  "footer.terms":     { tr: "Kullanım Şartları",   de: "AGB",              en: "Terms of Service",  ar: "شروط الخدمة" },
  "footer.iso":       { tr: "ISO Sertifikaları",    de: "ISO-Zertifikate",  en: "ISO Certifications", ar: "شهادات ISO" },
  "footer.sustain":   { tr: "Sürdürülebilirlik",    de: "Nachhaltigkeit",   en: "Sustainability",    ar: "الاستدامة" },
  "footer.address":   { tr: "Akçataş OSB, Viranşehir / Şanlıurfa · Küresel teslimat.",
                        de: "Akçataş OSB, Viranşehir / Şanlıurfa · Weltweite Lieferung.",
                        en: "Akçataş OSB, Viranşehir / Şanlıurfa · Global delivery.",
                        ar: "أكجاطاش OSB، فيران شهير / شانلي أورفا · توصيل عالمي." },

  /* -------------------- HOME -------------------- */
  "home.title":       { tr: "AK BORU PROFİL — Hassas Çelik Profiller", de: "AK BORU PROFIL — Präzisions-Stahlprofile",
                        en: "AK BORU PROFIL — Precision Steel Profiles", ar: "AK BORU PROFIL — مقاطع فولاذية دقيقة" },
  "home.kicker":      { tr: "ENDÜSTRİYEL HASSASİYET // TÜRKİYE",
                        de: "INDUSTRIELLE PRÄZISION // TÜRKEI",
                        en: "INDUSTRIAL PRECISION // TÜRKİYE",
                        ar: "دقة صناعية // تركيا" },
  "home.hero.h1.l1":  { tr: "YAPISAL",    de: "STRUKTURELLE", en: "STRUCTURAL", ar: "تكامل" },
  "home.hero.h1.l2":  { tr: "BÜTÜNLÜK.",  de: "INTEGRITÄT.",   en: "INTEGRITY.", ar: "هيكلي." },
  "home.hero.lead":   { tr: "Modern mimari ve ağır sanayi için soğuk şekillendirilmiş çelik profiller. Hassas üretim, küresel teslimat.",
                        de: "Kaltgeformte Stahlprofile für moderne Architektur und Schwerindustrie. Präzisionsfertigung, weltweite Auslieferung.",
                        en: "Cold-formed steel profiles for modern architecture and heavy industry. Precision manufacturing, global delivery.",
                        ar: "مقاطع فولاذية مشكلة على البارد للهندسة المعمارية الحديثة والصناعات الثقيلة. تصنيع دقيق وتسليم عالمي." },
  "home.stat.years":  { tr: "Faaliyet Yılı", de: "Jahre Erfahrung", en: "Years in Operation", ar: "سنوات من التشغيل" },
  "home.stat.tons":   { tr: "Yıllık Kapasite (ton)", de: "Jahreskapazität (Tonnen)", en: "Annual Capacity (tons)", ar: "السعة السنوية (طن)" },
  "home.stat.countries":{ tr: "İhracat Ülkesi", de: "Exportländer", en: "Export Countries", ar: "دول التصدير" },
  "home.stat.tolerance":{ tr: "Tolerans", de: "Toleranz", en: "Tolerance", ar: "التسامح" },

  "home.sections.title":   { tr: "Faaliyet Alanlarımız", de: "Unsere Bereiche", en: "Our Divisions", ar: "أقسامنا" },
  "home.sections.sub":     { tr: "Üç çekirdek disiplin. Tek standart: uzlaşmasız hassasiyet.",
                             de: "Drei Kerndisziplinen. Ein Standard: kompromisslose Präzision.",
                             en: "Three core disciplines. One standard: uncompromising precision.",
                             ar: "ثلاثة تخصصات أساسية. معيار واحد: دقة لا تقبل المساومة." },

  "home.tile.products.title": { tr: "Ürün Portföyü",  de: "Produktportfolio", en: "Product Portfolio", ar: "محفظة المنتجات" },
  "home.tile.products.desc":  { tr: "RHS, CHS ve hassas profiller. EN 10219 standardı.",
                                de: "RHS, CHS und Präzisionsprofile. Nach EN 10219.",
                                en: "RHS, CHS and precision profiles. Per EN 10219.",
                                ar: "مقاطع RHS وCHS ومقاطع دقيقة وفق EN 10219." },
  "home.tile.engineering.title":{ tr: "Mühendislik", de: "Engineering",  en: "Engineering",  ar: "الهندسة" },
  "home.tile.engineering.desc": { tr: "Teknik kabiliyetler, standartlar ve sürdürülebilirlik.",
                                  de: "Technische Fähigkeiten, Standards und Nachhaltigkeit.",
                                  en: "Technical capabilities, standards and sustainability.",
                                  ar: "القدرات التقنية والمعايير والاستدامة." },
  "home.tile.facilities.title": { tr: "Üretim Tesisi", de: "Produktionsanlage", en: "Manufacturing Facility", ar: "منشأة التصنيع" },
  "home.tile.facilities.desc":  { tr: "Robotik kaynak, CNC kesim, gerçek zamanlı izleme.",
                                  de: "Robotergeschweißt, CNC-Schnitt, Echtzeit-Monitoring.",
                                  en: "Robotic welding, CNC cutting, real-time monitoring.",
                                  ar: "لحام آلي، قطع CNC، مراقبة فورية." },

  /* -------------------- PRODUCTS -------------------- */
  "products.pageTitle":{ tr: "Ürünler — AK BORU PROFİL", de: "Produkte — AK BORU PROFIL", en: "Products — AK BORU PROFIL", ar: "المنتجات — AK BORU PROFIL" },
  "products.hero.h1.l1":{ tr: "YAPISAL",    de: "STRUKTURELLE", en: "STRUCTURAL", ar: "تكامل" },
  "products.hero.h1.l2":{ tr: "BÜTÜNLÜK",   de: "INTEGRITÄT",   en: "INTEGRITY",   ar: "هيكلي" },
  "products.hero.sub": { tr: "Hassas mühendislik endüstriyel çözümler. Küresel mimari için uzlaşmasız mukavemet.",
                         de: "Präzise konstruierte Industrielösungen. Kompromisslose Festigkeit für die globale Architektur.",
                         en: "Precision engineered industrial solutions. Uncompromising strength for global architecture.",
                         ar: "حلول صناعية مهندسة بدقة. قوة لا تقبل المساومة للهندسة المعمارية العالمية." },

  "products.section.title":{ tr: "Mühendislik Profilleri", de: "Konstruierte Profile", en: "Engineered Profiles", ar: "المقاطع المهندسة" },
  "products.section.sub":  { tr: "Yüksek toleranslı, soğuk şekillendirilmiş kesitler", de: "Hochpräzise kaltgeformte Sektionen",
                             en: "High-Tolerance Cold Formed Sections", ar: "مقاطع مشكلة على البارد بدقة عالية" },

  "products.rhs.title":    { tr: "Dikdörtgen İçi Boş Profil (RHS)", de: "Rechteckiges Hohlprofil (RHS)",
                             en: "Rectangular Hollow Section (RHS)", ar: "مقطع مجوف مستطيل (RHS)" },
  "products.chs.title":    { tr: "Yuvarlak İçi Boş Profil (CHS)", de: "Rundes Hohlprofil (CHS)",
                             en: "Circular Hollow Section (CHS)", ar: "مقطع مجوف دائري (CHS)" },
  "products.shs.title":    { tr: "Kare İçi Boş Profil (SHS)", de: "Quadratisches Hohlprofil (SHS)",
                             en: "Square Hollow Section (SHS)", ar: "مقطع مجوف مربع (SHS)" },

  "products.spec.dimensions":   { tr: "BOYUTLAR",       de: "ABMESSUNGEN",     en: "DIMENSIONS",       ar: "الأبعاد" },
  "products.spec.outerDiameter":{ tr: "DIŞ ÇAP",        de: "AUSSENDURCHM.",   en: "OUTER DIAMETER",   ar: "القطر الخارجي" },
  "products.spec.wall":         { tr: "ET KALINLIĞI",   de: "WANDDICKE",       en: "WALL THICKNESS",   ar: "سمك الجدار" },
  "products.spec.length":       { tr: "STANDART BOY",   de: "STANDARDLÄNGE",   en: "STANDARD LENGTH",  ar: "الطول القياسي" },
  "products.spec.tolerance":    { tr: "TOLERANS",       de: "TOLERANZ",         en: "TOLERANCE",        ar: "التسامح" },
  "products.spec.toleranceVal": { tr: "Sınıf 1 / Hassas", de: "Klasse 1 / Präzision", en: "Class 1 / Precision", ar: "الفئة 1 / دقيق" },

  /* -------------------- ENGINEERING -------------------- */
  "engineering.pageTitle":{ tr: "Mühendislik & İnovasyon — AK BORU PROFİL",
                            de: "Engineering & Innovation — AK BORU PROFIL",
                            en: "Engineering & Innovation — AK BORU PROFIL",
                            ar: "الهندسة والابتكار — AK BORU PROFIL" },
  "engineering.kicker": { tr: "HASSAS MÜHENDİSLİK", de: "PRÄZISIONS-ENGINEERING", en: "Precision Engineering", ar: "هندسة دقيقة" },
  "engineering.hero.h1.l1":{ tr: "YAPISAL",    de: "STRUKTURELLE", en: "STRUCTURAL", ar: "تكامل" },
  "engineering.hero.h1.l2":{ tr: "BÜTÜNLÜK.",  de: "INTEGRITÄT.",   en: "INTEGRITY.", ar: "هيكلي." },
  "engineering.hero.sub":{ tr: "Tam toleranslarla mühendislik. Soğuk şekillendirilmiş çelik profillerimiz, modern mimarinin ve ağır sanayinin en katı yapısal taleplerini karşılar.",
                           de: "Auf exakte Toleranzen konstruiert. Unsere kaltgeformten Stahlprofile erfüllen die strengsten strukturellen Anforderungen moderner Architektur und Schwerindustrie.",
                           en: "Engineered to exact tolerances. Our cold-formed steel profiles meet the most stringent structural demands of modern architecture and heavy industry.",
                           ar: "مهندسة بتفاوتات دقيقة. تلبي مقاطعنا الفولاذية المشكلة على البارد أشد المتطلبات الهيكلية صرامة للهندسة المعمارية الحديثة والصناعات الثقيلة." },

  "engineering.specs.title":{ tr: "TEKNİK YETENEKLER", de: "TECHNISCHE FÄHIGKEITEN", en: "TECHNICAL CAPABILITIES", ar: "القدرات التقنية" },
  "engineering.specs.sub":  { tr: "ÜRETİM TOLERANSLARI VE METRİKLER", de: "FERTIGUNGSTOLERANZEN & KENNZAHLEN",
                              en: "MANUFACTURING TOLERANCES & METRICS", ar: "تفاوتات التصنيع والمقاييس" },
  "engineering.specs.dimRange": { tr: "Boyut Aralığı", de: "Abmessungsbereich", en: "Dimension Range", ar: "نطاق الأبعاد" },
  "engineering.specs.mm":       { tr: "Milimetre (mm)", de: "Millimeter (mm)", en: "Millimeters (mm)", ar: "مليمترات (mm)" },
  "engineering.specs.m":        { tr: "Metre (m)", de: "Meter (m)", en: "Meters (m)", ar: "أمتار (m)" },
  "engineering.specs.customDim":{ tr: "Özel boyutlar mevcuttur", de: "Sonderabmessungen verfügbar",
                                   en: "Custom dimensions available", ar: "أبعاد مخصصة متاحة" },
  "engineering.specs.wall":     { tr: "Et Kalınlığı", de: "Wanddicke", en: "Wall Thickness", ar: "سمك الجدار" },
  "engineering.specs.highTensile":{ tr: "Yüksek mukavemet seçenekleri", de: "Hochfeste Optionen",
                                    en: "High-tensile options", ar: "خيارات عالية الشد" },
  "engineering.specs.length":   { tr: "Standart Boy", de: "Standardlänge", en: "Standard Length", ar: "الطول القياسي" },
  "engineering.specs.cutToLen": { tr: "Tam ölçü kesim hizmeti", de: "Maßgenauer Zuschnitt-Service",
                                  en: "Exact cut-to-length service", ar: "خدمة قطع بطول دقيق" },

  "engineering.standards.title":{ tr: "UZLAŞMASIZ", de: "KOMPROMISSLOSE", en: "UNCOMPROMISING", ar: "بلا تنازلات" },
  "engineering.standards.title2":{ tr: "STANDARTLAR.", de: "STANDARDS.",  en: "STANDARDS.",      ar: "المعايير." },
  "engineering.standards.text": { tr: "Tesisimizden çıkan her profil, yük altında mutlak yapısal bütünlüğü garanti etmek için titiz otomatik tahribatsız muayeneye (NDT) tabi tutulur.",
                                  de: "Jedes Profil, das unsere Anlage verlässt, durchläuft eine rigorose automatisierte zerstörungsfreie Prüfung (ZfP), um absolute strukturelle Integrität unter Last zu gewährleisten.",
                                  en: "Every profile leaving our facility is subject to rigorous automated non-destructive testing (NDT) to ensure absolute structural integrity under load.",
                                  ar: "يخضع كل مقطع يخرج من منشأتنا لاختبار آلي صارم غير إتلافي (NDT) لضمان السلامة الهيكلية المطلقة تحت الحمل." },
  "engineering.standards.iso":    { tr: "Kalite Yönetim Sistemi", de: "Qualitätsmanagementsystem",
                                    en: "Quality Management System", ar: "نظام إدارة الجودة" },
  "engineering.standards.en":     { tr: "Soğuk Şekillendirilmiş Kaynaklı Yapısal İçi Boş Profiller",
                                    de: "Kaltgeformte geschweißte tragende Hohlprofile",
                                    en: "Cold Formed Welded Structural Hollow Sections",
                                    ar: "مقاطع مجوفة هيكلية ملحومة مشكلة على البارد" },

  "engineering.sustain.kicker":{ tr: "SÜRDÜRÜLEBİLİRLİK", de: "NACHHALTIGKEIT", en: "SUSTAINABILITY", ar: "الاستدامة" },
  "engineering.sustain.title":{ tr: "DÖNGÜSEL MÜHENDİSLİK", de: "KREISLAUF-ENGINEERING",
                                en: "CIRCULAR ENGINEERING", ar: "هندسة دائرية" },
  "engineering.sustain.text": { tr: "Çelik, özelliklerini kaybetmeden sonsuz kez geri dönüştürülebilir. Üretim sürecimiz atığı ve karbon ayak izini en aza indirecek şekilde optimize edilmiştir.",
                                de: "Stahl ist unendlich oft ohne Qualitätsverlust recycelbar. Unser Produktionsprozess ist auf minimalen Abfall und CO₂-Fußabdruck optimiert.",
                                en: "Steel is infinitely recyclable without loss of properties. Our production process is optimized to minimize waste and carbon footprint.",
                                ar: "الفولاذ قابل لإعادة التدوير إلى ما لا نهاية دون فقدان خصائصه. عمليتنا الإنتاجية مُحسَّنة لتقليل النفايات والبصمة الكربونية." },
  "engineering.sustain.metric":{ tr: "Hurda Geri Dönüşüm Oranı", de: "Schrott-Recyclingquote",
                                 en: "Scrap Recycling Rate", ar: "معدل إعادة تدوير الخردة" },

  /* -------------------- FACILITIES -------------------- */
  "facilities.pageTitle":{ tr: "Tesisler — AK BORU PROFİL", de: "Anlagen — AK BORU PROFIL",
                            en: "Facilities — AK BORU PROFIL", ar: "المنشآت — AK BORU PROFIL" },
  "facilities.kicker":   { tr: "TESİS GENEL BAKIŞ // 01", de: "ANLAGENÜBERSICHT // 01",
                            en: "FACILITY OVERVIEW // 01", ar: "نظرة عامة على المنشأة // 01" },
  "facilities.hero.h1.l1":{ tr: "HER AŞAMADA",   de: "PRÄZISION IN",  en: "PRECISION IN",  ar: "الدقة في" },
  "facilities.hero.h1.l2":{ tr: "HASSASİYET",     de: "JEDER PHASE",   en: "EVERY PHASE",   ar: "كل مرحلة" },
  "facilities.hero.sub": { tr: "Son teknoloji üretim tesisimiz, ağır sanayi kabiliyetini temiz oda hassasiyetiyle birleştirir. Otomatik sistemler ve titiz kalite kontrolü, uzlaşmasız yapısal bütünlüğü güvence altına alır.",
                           de: "Unsere hochmoderne Produktionsanlage vereint schwerindustrielle Leistungsfähigkeit mit Reinraum-Präzision. Automatisierte Systeme und strenge Qualitätskontrolle gewährleisten kompromisslose strukturelle Integrität.",
                           en: "Our state-of-the-art manufacturing facility combines heavy industrial capability with clean-room precision. Automated systems and rigorous quality control ensure uncompromising structural integrity.",
                           ar: "تجمع منشأتنا التصنيعية المتطورة بين القدرات الصناعية الثقيلة ودقة الغرف النظيفة. تضمن الأنظمة الآلية ورقابة الجودة الصارمة سلامة هيكلية لا تقبل المساومة." },

  "facilities.cap.title":  { tr: "Çekirdek Yetkinlikler", de: "Kernkompetenzen",
                             en: "Core Capabilities", ar: "القدرات الأساسية" },
  "facilities.cap1.title": { tr: "İleri Kaynak", de: "Fortschrittliches Schweißen",
                             en: "Advanced Welding", ar: "اللحام المتقدم" },
  "facilities.cap1.text":  { tr: "Maksimum yük taşıma kapasitesi için tutarlı, yüksek nüfuziyetli birleştirmeler sağlayan robotik ark kaynak sistemleri.",
                             de: "Roboter-Lichtbogenschweißsysteme für konsistente, tiefe Schweißnähte mit maximaler Tragfähigkeit.",
                             en: "Robotic arc welding systems delivering consistent, high-penetration joints for maximum load-bearing capacity.",
                             ar: "أنظمة لحام قوسي آلية توفر وصلات متسقة عميقة الاختراق لأقصى قدرة على تحمل الأحمال." },
  "facilities.cap1.tol":   { tr: "TOLERANS", de: "TOLERANZ", en: "TOLERANCE", ar: "التسامح" },
  "facilities.cap1.cap":   { tr: "KAPASİTE / GÜN", de: "KAPAZITÄT / TAG", en: "CAPACITY / DAY", ar: "السعة / يومياً" },

  "facilities.cap2.title": { tr: "Hassas Kesim", de: "Präzisionsschnitt",
                             en: "Precision Cutting", ar: "قطع دقيق" },
  "facilities.cap2.text":  { tr: "Karmaşık geometrik profillerde tam boyutsal doğruluğu sağlayan lazer ve plazma CNC kesim.",
                             de: "Laser- und Plasma-CNC-Schneiden für exakte Maßhaltigkeit bei komplexen Geometrien.",
                             en: "Laser and plasma CNC cutting ensuring exact dimensional accuracy across complex geometric profiles.",
                             ar: "قطع CNC بالليزر والبلازما يضمن دقة بُعدية تامة عبر مقاطع هندسية معقدة." },
  "facilities.cap2.tech":  { tr: "TEKNOLOJİ", de: "TECHNIK", en: "TECH", ar: "التقنية" },
  "facilities.cap2.techVal":{ tr: "FİBER LAZER", de: "FASERLASER", en: "FIBER LASER", ar: "ليزر ليفي" },
  "facilities.cap2.maxT":  { tr: "MAKS. KALINLIK", de: "MAX. DICKE", en: "MAX THICKNESS", ar: "الحد الأقصى للسمك" },

  "facilities.cap3.title": { tr: "Kalite Kontrolü", de: "Qualitätskontrolle",
                             en: "Quality Control", ar: "مراقبة الجودة" },
  "facilities.cap3.text":  { tr: "Tahribatsız muayene, ultrasonik kusur tespiti ve sürekli otomatik boyutsal tarama.",
                             de: "Zerstörungsfreie Prüfung, Ultraschall-Fehlererkennung und kontinuierliches automatisches Maßscannen.",
                             en: "Non-destructive testing, ultrasonic flaw detection, and continuous automated dimensional scanning.",
                             ar: "اختبار غير إتلافي، كشف عيوب بالموجات فوق الصوتية، ومسح أبعاد آلي مستمر." },
  "facilities.cap3.std":   { tr: "STANDART", de: "STANDARD", en: "STANDARD", ar: "المعيار" },
  "facilities.cap3.defect":{ tr: "HATA ORANI", de: "FEHLERRATE", en: "DEFECT RATE", ar: "نسبة العيوب" },

  "facilities.mon.title":  { tr: "Gerçek Zamanlı İzleme", de: "Echtzeit-Monitoring",
                             en: "Real-Time Monitoring", ar: "مراقبة فورية" },
  "facilities.mon.text":   { tr: "Üretimimizin her aşaması merkezi bir SCADA sistemiyle izlenir. Veriler, çevresel parametrelerin, makine toleranslarının ve malzeme bütünlüğünün operasyonel sınırlar içinde kalmasını sağlamak için gerçek zamanlı olarak toplanır.",
                             de: "Jede Phase unserer Produktion wird über ein zentrales SCADA-System überwacht. Daten werden in Echtzeit aggregiert, um Umweltparameter, Maschinentoleranzen und Materialintegrität innerhalb strenger Betriebsgrenzen zu halten.",
                             en: "Every phase of our production is monitored through a centralized SCADA system. Data is aggregated in real-time to ensure environmental parameters, machine tolerances, and material integrity remain within strict operational bounds.",
                             ar: "تتم مراقبة كل مرحلة من إنتاجنا عبر نظام SCADA مركزي. تُجمَّع البيانات فورياً لضمان بقاء المعايير البيئية وتفاوتات الآلات وسلامة المواد ضمن الحدود التشغيلية الصارمة." },
  "facilities.mon.sensor": { tr: "Sensör Düğümü Alfa", de: "Sensor-Knoten Alpha",
                             en: "Sensor Node Alpha", ar: "عقدة الاستشعار ألفا" },
  "facilities.mon.yield":  { tr: "Verim Analizi", de: "Ertragsanalyse",
                             en: "Yield Analysis", ar: "تحليل العائد" },

  /* -------------------- COMPANY -------------------- */
  "company.pageTitle":{ tr: "Şirket — AK BORU PROFİL", de: "Unternehmen — AK BORU PROFIL",
                        en: "Company — AK BORU PROFIL", ar: "الشركة — AK BORU PROFIL" },
  "company.kicker":   { tr: "KÖKLERİMİZ // TÜRKİYE", de: "UNSERE WURZELN // TÜRKEI",
                        en: "OUR ROOTS // TÜRKİYE", ar: "جذورنا // تركيا" },
  "company.hero.h1.l1":{ tr: "ÇELİĞİN",   de: "DIE ARCHITEKTUR",  en: "THE ARCHITECTURE", ar: "هندسة" },
  "company.hero.h1.l2":{ tr: "MİMARİSİ.",  de: "DES STAHLS.",      en: "OF STEEL.",         ar: "الفولاذ." },
  "company.hero.sub": { tr: "Türkiye'de doğdu, küresel mühendislik için inşa edildi. AK BORU PROFİL, hassas soğuk şekillendirilmiş çelik kesitlerinde sessizce bir referans haline geldi.",
                        de: "In der Türkei entstanden, für globales Engineering gebaut. AK BORU PROFIL ist still zum Referenzpunkt für präzisionsgefertigte kaltgeformte Stahlprofile geworden.",
                        en: "Born in Türkiye, built for global engineering. AK BORU PROFIL has quietly become a reference point for precision-formed cold-rolled steel sections.",
                        ar: "وُلدت في تركيا، صُنعت من أجل الهندسة العالمية. أصبحت AK BORU PROFIL مرجعاً هادئاً لمقاطع الفولاذ المدلفنة على البارد بدقة." },

  "company.story.title":{ tr: "MERKEZ HİKAYESİ", de: "DIE GESCHICHTE",
                          en: "THE CORE STORY", ar: "القصة الأساسية" },
  "company.story.p1": { tr: "Üç çekirdek prensip üzerine kurulduk: malzeme bütünlüğü, otomatik tekrarlanabilirlik ve müşterinin yapısal güvenine saygı. Her vardiya, her kaynak, her tolerans bu üç eksen üzerinde ölçülür.",
                        de: "Wir wurden auf drei Kernprinzipien gebaut: Materialintegrität, automatisierte Reproduzierbarkeit und Respekt vor dem strukturellen Vertrauen unserer Kunden. Jede Schicht, jede Schweißnaht, jede Toleranz wird an diesen drei Achsen gemessen.",
                        en: "We were built on three core principles: material integrity, automated repeatability, and respect for our customers' structural trust. Every shift, every weld, every tolerance is measured against these three axes.",
                        ar: "بُنينا على ثلاثة مبادئ جوهرية: سلامة المواد، التكرار الآلي، واحترام الثقة الهيكلية لعملائنا. تُقاس كل مناوبة وكل لحام وكل تفاوت بهذه المحاور الثلاثة." },
  "company.story.p2": { tr: "Bugün Avrupa, Orta Doğu ve Kuzey Afrika'daki mimarlar, yapısal mühendisler ve müteahhitler için tedarik ediyoruz — projelerin uzlaşma kaldırmadığı yerlerde.",
                        de: "Heute beliefern wir Architekten, Bauingenieure und Generalunternehmer in Europa, dem Nahen Osten und Nordafrika — überall dort, wo Projekte keine Kompromisse zulassen.",
                        en: "Today we supply architects, structural engineers and general contractors across Europe, the Middle East and North Africa — wherever projects refuse compromise.",
                        ar: "اليوم نزوّد المعماريين والمهندسين الإنشائيين والمقاولين في أوروبا والشرق الأوسط وشمال أفريقيا — حيثما ترفض المشاريع المساومة." },

  "company.values.title":{ tr: "BİZİ AYIRAN", de: "WAS UNS UNTERSCHEIDET",
                           en: "WHAT SETS US APART", ar: "ما يميزنا" },
  "company.value1.title":{ tr: "Tutarlılık", de: "Konsistenz", en: "Consistency", ar: "الاتساق" },
  "company.value1.text": { tr: "Üretim bandından çıkan ilk metre ile son metre arasında ölçülebilir bir fark yoktur.",
                           de: "Zwischen dem ersten und letzten Meter aus der Fertigung gibt es keinen messbaren Unterschied.",
                           en: "There is no measurable difference between the first and the last meter leaving the line.",
                           ar: "لا يوجد فرق قابل للقياس بين أول وآخر متر يخرج من خط الإنتاج." },
  "company.value2.title":{ tr: "İzlenebilirlik", de: "Rückverfolgbarkeit", en: "Traceability", ar: "إمكانية التتبع" },
  "company.value2.text": { tr: "Her parça, ham bobin tedarikçisine kadar geri izlenebilir. Sertifika ekteki QR koduyla doğrulanır.",
                           de: "Jedes Stück lässt sich bis zum Coil-Lieferanten zurückverfolgen. Zertifikat per QR-Code verifizierbar.",
                           en: "Every piece is traceable back to the raw coil supplier. Certificates are QR-verified.",
                           ar: "كل قطعة قابلة للتتبع وصولاً إلى مورد اللفائف الخام. تُتحقق الشهادات عبر رمز QR." },
  "company.value3.title":{ tr: "Teslimat Hassasiyeti", de: "Lieferpräzision", en: "Delivery Precision", ar: "دقة التسليم" },
  "company.value3.text": { tr: "Vardığında tam ölçüde, tam zamanında, tam sayıda. Şantiyede sürpriz yok.",
                           de: "Bei Anlieferung exakt im Maß, exakt zur Zeit, exakt in Stückzahl. Keine Überraschungen auf der Baustelle.",
                           en: "Exact dimensions, exact time, exact count. No surprises on site.",
                           ar: "أبعاد دقيقة، وقت دقيق، عدد دقيق. لا مفاجآت في الموقع." },

  "company.timeline.title":{ tr: "Zaman Çizelgesi", de: "Zeitstrahl", en: "Timeline", ar: "الجدول الزمني" },
  "company.t1.title":  { tr: "Kuruluş", de: "Gründung", en: "Founded", ar: "التأسيس" },
  "company.t1.text":   { tr: "Türkiye'de küçük ölçekli soğuk şekillendirme atölyesi olarak başladık.",
                         de: "Start als kleiner Kaltformbetrieb in der Türkei.",
                         en: "Started as a small cold-forming workshop in Türkiye.",
                         ar: "بدأنا كورشة تشكيل صغيرة على البارد في تركيا." },
  "company.t2.title":  { tr: "İlk Otomasyon", de: "Erste Automation", en: "First Automation", ar: "أول أتمتة" },
  "company.t2.text":   { tr: "İlk robotik kaynak hücresi devreye alındı. Toleranslar ±0.1 mm'ye düştü.",
                         de: "Erste Roboter-Schweißzelle in Betrieb. Toleranzen auf ±0,1 mm gesenkt.",
                         en: "First robotic welding cell brought online. Tolerances dropped to ±0.1 mm.",
                         ar: "تشغيل أول خلية لحام آلية. انخفضت التفاوتات إلى ±0.1 مم." },
  "company.t3.title":  { tr: "EN 10219 Sertifikasyonu", de: "EN-10219-Zertifizierung", en: "EN 10219 Certification", ar: "اعتماد EN 10219" },
  "company.t3.text":   { tr: "Tam EN 10219 ve ISO 9001:2015 uyumluluğu doğrulandı.",
                         de: "Vollständige EN-10219- und ISO-9001:2015-Konformität bestätigt.",
                         en: "Full EN 10219 and ISO 9001:2015 conformity certified.",
                         ar: "تم اعتماد التوافق الكامل مع EN 10219 وISO 9001:2015." },
  "company.t4.title":  { tr: "Küresel İhracat", de: "Globaler Export", en: "Global Export", ar: "تصدير عالمي" },
  "company.t4.text":   { tr: "40+ ülkeye sevkiyat. Avrupa, MENA ve Orta Asya'da referans projeler.",
                         de: "Versand in 40+ Länder. Referenzprojekte in Europa, MENA und Zentralasien.",
                         en: "Shipments to 40+ countries. Reference projects across Europe, MENA, and Central Asia.",
                         ar: "شحنات إلى أكثر من 40 دولة. مشاريع مرجعية في أوروبا والشرق الأوسط وشمال إفريقيا وآسيا الوسطى." },

  /* -------------------- CONTACT -------------------- */
  "contact.pageTitle":{ tr: "İletişim — AK BORU PROFİL", de: "Kontakt — AK BORU PROFIL",
                        en: "Contact — AK BORU PROFIL", ar: "اتصل بنا — AK BORU PROFIL" },
  "contact.kicker":   { tr: "TEKLİF // 30 DK İÇİNDE", de: "ANGEBOT // INNERHALB 30 MIN",
                        en: "QUOTE // WITHIN 30 MIN", ar: "عرض سعر // خلال 30 دقيقة" },
  "contact.hero.h1.l1":{ tr: "PROJENİZ.",      de: "IHR PROJEKT.",  en: "YOUR PROJECT.", ar: "مشروعك." },
  "contact.hero.h1.l2":{ tr: "BİZİM TOLERANSIMIZ.", de: "UNSERE TOLERANZ.", en: "OUR TOLERANCE.", ar: "تفاوتنا." },
  "contact.hero.sub": { tr: "Spesifikasyonlarınızı paylaşın — mühendislik ekibimiz 30 dakika içinde uygun profilleri, mevcut stoğu ve teslimat penceresini geri döner.",
                        de: "Teilen Sie Ihre Spezifikationen — unser Engineering-Team meldet sich innerhalb von 30 Minuten mit passenden Profilen, Bestand und Lieferfenster zurück.",
                        en: "Share your specs — our engineering team comes back within 30 minutes with matching profiles, current stock and a delivery window.",
                        ar: "شارك مواصفاتك — يعود فريق الهندسة خلال 30 دقيقة بالمقاطع المناسبة والمخزون الحالي ونافذة التسليم." },

  "contact.form.title":{ tr: "Teklif Formu", de: "Anfrageformular", en: "Quote Request", ar: "طلب عرض سعر" },
  "contact.form.name": { tr: "Tam Ad", de: "Vollständiger Name", en: "Full Name", ar: "الاسم الكامل" },
  "contact.form.company":{ tr: "Şirket", de: "Firma", en: "Company", ar: "الشركة" },
  "contact.form.email":{ tr: "İş E-posta", de: "Geschäftliche E-Mail", en: "Business Email", ar: "البريد المهني" },
  "contact.form.phone":{ tr: "Telefon", de: "Telefon", en: "Phone", ar: "الهاتف" },
  "contact.form.country":{ tr: "Ülke / Şantiye", de: "Land / Standort", en: "Country / Site", ar: "البلد / الموقع" },
  "contact.form.product":{ tr: "Ürün", de: "Produkt", en: "Product", ar: "المنتج" },
  "contact.form.product.rhs":{ tr: "RHS — Dikdörtgen", de: "RHS — Rechteckig", en: "RHS — Rectangular", ar: "RHS — مستطيل" },
  "contact.form.product.chs":{ tr: "CHS — Yuvarlak",   de: "CHS — Rund",       en: "CHS — Circular",    ar: "CHS — دائري" },
  "contact.form.product.shs":{ tr: "SHS — Kare",       de: "SHS — Quadratisch",en: "SHS — Square",      ar: "SHS — مربع" },
  "contact.form.product.other":{ tr: "Diğer / Özel", de: "Sonstiges / Sonderanfertigung", en: "Other / Custom", ar: "أخرى / مخصص" },
  "contact.form.tonnage":{ tr: "Tahmini Tonaj", de: "Geschätzte Tonnage", en: "Estimated Tonnage", ar: "الحمولة التقديرية" },
  "contact.form.deadline":{ tr: "İhtiyaç Tarihi", de: "Bedarfsdatum", en: "Required By", ar: "مطلوب بحلول" },
  "contact.form.message":{ tr: "Mesaj / Spesifikasyonlar", de: "Nachricht / Spezifikationen",
                            en: "Message / Specifications", ar: "الرسالة / المواصفات" },
  "contact.form.message.ph":{ tr: "Boyutlar, et kalınlığı, sınıf, yüzey işlemi, sertifika ihtiyacı...",
                              de: "Abmessungen, Wanddicke, Güte, Oberflächenbehandlung, Zertifikatsbedarf …",
                              en: "Dimensions, wall thickness, grade, surface treatment, required certificates…",
                              ar: "الأبعاد، سمك الجدار، الدرجة، المعالجة السطحية، الشهادات المطلوبة…" },
  "contact.form.consent":{ tr: "Verilerimin bu talep için işlenmesini kabul ediyorum.",
                            de: "Ich willige in die Verarbeitung meiner Daten für diese Anfrage ein.",
                            en: "I agree to my data being processed for this request.",
                            ar: "أوافق على معالجة بياناتي لأغراض هذا الطلب." },
  "contact.form.submit":{ tr: "Talep Gönder", de: "Anfrage senden",
                          en: "Send Request", ar: "إرسال الطلب" },
  "contact.form.success":{ tr: "Talebiniz alındı. 30 dk içinde dönüş yapacağız.",
                           de: "Anfrage erhalten. Wir melden uns innerhalb von 30 Minuten.",
                           en: "Request received. We'll respond within 30 minutes.",
                           ar: "تم استلام طلبك. سنرد خلال 30 دقيقة." },

  "contact.info.title":{ tr: "Doğrudan İletişim", de: "Direkter Kontakt",
                          en: "Direct Channels", ar: "قنوات مباشرة" },
  "contact.info.hq":   { tr: "Genel Merkez", de: "Hauptsitz", en: "Headquarters", ar: "المقر الرئيسي" },
  "contact.info.hqVal":{ tr: "Akçataş OSB, 10. Cad. No 5/1\nViranşehir / Şanlıurfa, Türkiye",
                         de: "Akçataş OSB, 10. Cad. No 5/1\nViranşehir / Şanlıurfa, Türkei",
                         en: "Akçataş OSB, 10. Cad. No 5/1\nViranşehir / Şanlıurfa, Türkiye",
                         ar: "أكجاطاش OSB، 10. شارع رقم 5/1\nفيران شهير / شانلي أورفا، تركيا" },
  "contact.info.directions":{ tr: "Yol tarifi al", de: "Route anzeigen",
                              en: "Get directions", ar: "احصل على الاتجاهات" },

  "map.title":     { tr: "Tesisi Bulun", de: "Anlage finden",
                     en: "Locate the Facility", ar: "حدد موقع المنشأة" },
  "map.sub":       { tr: "Akçataş OSB · Viranşehir · Şanlıurfa",
                     de: "Akçataş OSB · Viranşehir · Şanlıurfa",
                     en: "Akçataş OSB · Viranşehir · Şanlıurfa",
                     ar: "أكجاطاش OSB · فيران شهير · شانلي أورفا" },
  "map.openMaps":  { tr: "Google Haritalar'da aç", de: "In Google Maps öffnen",
                     en: "Open in Google Maps", ar: "افتح في خرائط جوجل" },
  "map.zoom":      { tr: "Kaydırarak yakınlaştırmak için tıklayın",
                     de: "Klicken zum Aktivieren des Mausrad-Zooms",
                     en: "Click to enable scroll zoom",
                     ar: "انقر لتفعيل التكبير بالعجلة" },
  "home.location.title":{ tr: "Türkiye'de üretim. Küresel sevkiyat.",
                          de: "Produktion in der Türkei. Weltweiter Versand.",
                          en: "Made in Türkiye. Shipped globally.",
                          ar: "صناعة في تركيا. شحن عالمي." },
  "home.location.sub":  { tr: "Akçataş OSB içinde modern soğuk şekillendirme tesisi. 40+ ülkeye liman ve karayolu üzerinden teslimat.",
                          de: "Modernes Kaltformwerk im Akçataş OSB. Lieferung in 40+ Länder per Hafen und Straße.",
                          en: "Modern cold-forming plant inside Akçataş OSB. Delivery to 40+ countries by port and road.",
                          ar: "مصنع حديث للتشكيل على البارد داخل أكجاطاش OSB. توصيل لأكثر من 40 دولة عبر الموانئ والطرق." }
  "contact.info.sales":{ tr: "Uluslararası Satış", de: "Internationaler Vertrieb",
                         en: "International Sales", ar: "المبيعات الدولية" },
  "contact.info.hours":{ tr: "Çalışma Saatleri", de: "Geschäftszeiten",
                         en: "Operating Hours", ar: "ساعات العمل" },
  "contact.info.hoursVal":{ tr: "Pzt–Cmt · 08:00–18:00 (GMT+3)",
                            de: "Mo–Sa · 08:00–18:00 (GMT+3)",
                            en: "Mon–Sat · 08:00–18:00 (GMT+3)",
                            ar: "الإثنين–السبت · 08:00–18:00 (GMT+3)" },
  "contact.info.lead": { tr: "Cevap Süresi", de: "Antwortzeit",
                         en: "Response Time", ar: "زمن الاستجابة" },
  "contact.info.leadVal":{ tr: "Saatler içinde, çoğu durumda 30 dakika.",
                           de: "Innerhalb von Stunden, meist 30 Minuten.",
                           en: "Within hours, usually 30 minutes.",
                           ar: "خلال ساعات، عادة 30 دقيقة." },

  /* -------------------- WIDGETS: WHATSAPP + AK ASSISTANT -------------------- */
  "wa.tooltip":       { tr: "WhatsApp ile yaz", de: "Per WhatsApp schreiben",
                        en: "Chat on WhatsApp", ar: "تواصل عبر واتساب" },
  "wa.prefill":       { tr: "Merhaba AK BORU ekibi, ürünleriniz hakkında bilgi almak istiyorum.",
                        de: "Hallo AK BORU Team, ich interessiere mich für Ihre Produkte.",
                        en: "Hi AK BORU team, I'd like more information about your products.",
                        ar: "مرحباً فريق AK BORU، أود الاستفسار عن منتجاتكم." },

  "ai.tooltip":       { tr: "AK Asistan", de: "AK-Assistent", en: "AK Assistant", ar: "مساعد AK" },
  "ai.title":         { tr: "AK Asistan",  de: "AK-Assistent",  en: "AK Assistant",  ar: "مساعد AK" },
  "ai.subtitle":      { tr: "Mühendislik & Satış · Anlık yanıt",
                        de: "Engineering & Sales · Sofort-Antwort",
                        en: "Engineering & Sales · Instant reply",
                        ar: "هندسة ومبيعات · رد فوري" },
  "ai.input.ph":      { tr: "Soru yazın… (örn. RHS toleransı)",
                        de: "Frage stellen … (z. B. RHS-Toleranz)",
                        en: "Ask anything… (e.g. RHS tolerance)",
                        ar: "اكتب سؤالك… (مثل تفاوت RHS)" },
  "ai.send":          { tr: "Gönder", de: "Senden", en: "Send", ar: "إرسال" },
  "ai.greeting":      { tr: "Merhaba, ben AK Asistan. Ürünler, toleranslar, standartlar ve teslimat hakkında yardımcı olabilirim. Ne sormak istersiniz?",
                        de: "Hallo, ich bin der AK-Assistent. Ich helfe bei Produkten, Toleranzen, Standards und Lieferzeiten. Was möchten Sie wissen?",
                        en: "Hi, I'm the AK Assistant. I can help with products, tolerances, standards and delivery. What would you like to know?",
                        ar: "مرحباً، أنا مساعد AK. يمكنني المساعدة في المنتجات والتفاوتات والمعايير والتسليم. ماذا تريد أن تعرف؟" },

  "ai.chip.products": { tr: "Ürünler", de: "Produkte", en: "Products", ar: "المنتجات" },
  "ai.chip.standards":{ tr: "Standartlar", de: "Standards", en: "Standards", ar: "المعايير" },
  "ai.chip.lead":     { tr: "Teslimat", de: "Lieferzeit", en: "Lead time", ar: "زمن التسليم" },
  "ai.chip.custom":   { tr: "Özel ölçü", de: "Sondermaß", en: "Custom size", ar: "مقاس مخصص" },
  "ai.chip.quote":    { tr: "Teklif al", de: "Angebot",   en: "Get quote", ar: "اطلب عرضاً" },

  "ai.r.products":    { tr: "Üç ana ürün ailemiz var: RHS (dikdörtgen, 20×10 mm – 400×300 mm), CHS (yuvarlak, Ø 13 mm – Ø 323.9 mm) ve SHS (kare, 10×10 mm – 400×400 mm). Et kalınlığı 0.5–16 mm. Hangisi sizi ilgilendiriyor?",
                        de: "Wir haben drei Hauptlinien: RHS (rechteckig, 20×10 mm – 400×300 mm), CHS (rund, Ø 13 mm – Ø 323,9 mm) und SHS (quadratisch, 10×10 mm – 400×400 mm). Wandstärke 0,5–16 mm. Welche interessiert Sie?",
                        en: "We have three main lines: RHS (rectangular, 20×10 mm – 400×300 mm), CHS (circular, Ø 13 mm – Ø 323.9 mm) and SHS (square, 10×10 mm – 400×400 mm). Wall thickness 0.5–16 mm. Which one fits your project?",
                        ar: "لدينا ثلاث عائلات منتجات: RHS (مستطيل، 20×10 مم – 400×300 مم)، CHS (دائري، Ø 13 مم – Ø 323.9 مم) وSHS (مربع، 10×10 مم – 400×400 مم). سمك الجدار 0.5–16 مم. أيها يناسب مشروعك؟" },
  "ai.r.standards":   { tr: "Üretim EN 10219-1/2 ve EN 10210 standartlarına uygundur. Kalite yönetimi ISO 9001:2015 sertifikalıdır. Çelik kaliteleri: S235JR, S275JR, S355J2H. Sertifikalar QR ile doğrulanabilir.",
                        de: "Wir fertigen nach EN 10219-1/2 und EN 10210. Qualitätsmanagement ist ISO 9001:2015 zertifiziert. Stahlgüten: S235JR, S275JR, S355J2H. Zertifikate sind per QR überprüfbar.",
                        en: "We manufacture to EN 10219-1/2 and EN 10210. Quality system is ISO 9001:2015 certified. Steel grades: S235JR, S275JR, S355J2H. Certificates are QR-verifiable.",
                        ar: "نُصنّع وفق EN 10219-1/2 وEN 10210. نظام الجودة معتمد ISO 9001:2015. درجات الفولاذ: S235JR وS275JR وS355J2H. الشهادات قابلة للتحقق عبر QR." },
  "ai.r.lead":        { tr: "Standart stok kalemleri için sevkiyat 5–10 iş günü içinde başlar. Üretime özel siparişler 3–4 hafta. Ülkenizi yazarsanız tahmini varış süresi verebilirim.",
                        de: "Lagerware verlässt das Werk in 5–10 Werktagen. Sonderfertigung 3–4 Wochen. Nennen Sie Ihr Land — ich kann eine grobe Ankunftszeit nennen.",
                        en: "Stock items ship within 5–10 working days. Made-to-order: 3–4 weeks. Tell me your country and I can estimate arrival time.",
                        ar: "تشحن المواد المخزّنة خلال 5–10 أيام عمل. الطلبات الخاصة 3–4 أسابيع. أخبرني ببلدك وأستطيع تقدير وقت الوصول." },
  "ai.r.custom":      { tr: "Evet, özel ölçü ve özel kesim destekliyoruz. Boyut, et kalınlığı, kalite ve adet bilgisi verirseniz, mühendislik ekibi 30 dk içinde dönüş yapar. WhatsApp'tan veya formdan iletmek ister misiniz?",
                        de: "Ja, Sonderabmessungen und Sonderzuschnitte sind möglich. Geben Sie Maß, Wandstärke, Güte und Stückzahl an — das Engineering meldet sich binnen 30 min. Lieber WhatsApp oder Formular?",
                        en: "Yes, custom dimensions and cut-to-length are supported. Share size, wall thickness, grade and quantity — engineering replies within 30 min. WhatsApp or form?",
                        ar: "نعم، ندعم الأبعاد المخصصة والقطع حسب الطول. شارك المقاس وسمك الجدار والدرجة والكمية — الفريق الهندسي يرد خلال 30 دقيقة. واتساب أم نموذج؟" },
  "ai.r.quote":       { tr: "Bağlayıcı teklif için kısa formu doldurun ya da WhatsApp'ta yazın — 30 dk içinde fiyat, stok ve teslimat ile dönüş yaparız.",
                        de: "Für ein verbindliches Angebot bitte kurz das Formular ausfüllen oder WhatsApp schreiben — wir melden uns in 30 min mit Preis, Bestand und Liefertermin.",
                        en: "For a binding quote, fill the short form or message us on WhatsApp — we reply within 30 min with price, stock and delivery.",
                        ar: "للحصول على عرض ملزم، املأ النموذج القصير أو راسلنا على واتساب — نرد خلال 30 دقيقة بالسعر والمخزون والتسليم." },
  "ai.r.sustain":     { tr: "Hurda geri dönüşüm oranımız %98. Çelik özelliğini kaybetmeden sınırsız geri dönüştürülebilir — bu yüzden döngüsel mühendislik bizim için sloganik değil ekonomik.",
                        de: "Unsere Schrott-Recyclingquote liegt bei 98 %. Stahl ist unendlich oft recycelbar ohne Eigenschaftsverlust — Kreislaufwirtschaft ist für uns kein Slogan, sondern Ökonomie.",
                        en: "Our scrap recycling rate is 98%. Steel is infinitely recyclable without loss of properties — circular engineering is economics for us, not a slogan.",
                        ar: "نسبة إعادة تدوير الخردة لدينا 98%. الفولاذ قابل لإعادة التدوير إلى ما لا نهاية دون فقدان خواصه — الاقتصاد الدائري عندنا اقتصاد، لا شعار." },
  "ai.r.location":    { tr: "Üretim ve merkez Akçataş OSB, Viranşehir / Şanlıurfa — Türkiye'de. 40+ ülkeye ihracat yapıyoruz (Avrupa, MENA, Orta Asya). Yükleme limanı ve hedef ülkeyi söylerseniz teslimat seçeneklerini özetleyebilirim.",
                        de: "Produktion und Sitz: Akçataş OSB, Viranşehir / Şanlıurfa — Türkei. Wir exportieren in 40+ Länder (Europa, MENA, Zentralasien). Nennen Sie Ladehafen und Ziel — ich fasse Lieferoptionen zusammen.",
                        en: "Production and HQ at Akçataş OSB, Viranşehir / Şanlıurfa — Türkiye. We export to 40+ countries (Europe, MENA, Central Asia). Tell me your loading port and destination and I'll outline delivery options.",
                        ar: "الإنتاج والمقر في أكجاطاش OSB، فيران شهير / شانلي أورفا — تركيا. نصدّر لأكثر من 40 دولة (أوروبا، الشرق الأوسط وشمال إفريقيا، وآسيا الوسطى). أخبرني بميناء التحميل والوجهة وأرتّب خيارات التسليم." },
  "ai.r.fallback":    { tr: "Bunu tam anlamadım. Şu konularda yardımcı olabilirim: ürünler, standartlar, teslimat süresi, özel ölçüler, fiyat teklifi, sürdürülebilirlik, lokasyon. Ya da doğrudan WhatsApp'a geçelim mi?",
                        de: "Das habe ich nicht ganz verstanden. Ich kann zu Produkten, Standards, Lieferzeit, Sonderabmessungen, Angebot, Nachhaltigkeit oder Standort helfen. Oder direkt zu WhatsApp wechseln?",
                        en: "I didn't quite catch that. I can help with products, standards, lead time, custom sizes, quotes, sustainability or location. Or jump straight to WhatsApp?",
                        ar: "لم أفهم تماماً. يمكنني المساعدة في المنتجات والمعايير وزمن التسليم والمقاسات المخصصة والعروض والاستدامة والموقع. أو ننتقل مباشرة إلى واتساب؟" },

  "ai.cta.wa":        { tr: "WhatsApp'a geç",  de: "Zu WhatsApp wechseln",  en: "Open WhatsApp",     ar: "فتح واتساب" },
  "ai.cta.form":      { tr: "Formu aç",         de: "Formular öffnen",        en: "Open form",          ar: "فتح النموذج" },
  "ai.disclaimer":    { tr: "Cevaplar bilgilendirme amaçlıdır. Bağlayıcı teklif için ekibimiz dönüş yapar.",
                        de: "Antworten sind unverbindlich. Für ein verbindliches Angebot meldet sich unser Team.",
                        en: "Answers are informational. Our team confirms binding offers.",
                        ar: "الإجابات للاسترشاد فقط. يقوم فريقنا بتأكيد العروض الملزمة." }
};

const STORAGE_KEY = "akboru.lang";

window.AKBORU = window.AKBORU || {};
window.AKBORU.LANGS = LANGS;
window.AKBORU.DICT = DICT;
window.AKBORU.getLang = () => localStorage.getItem(STORAGE_KEY) || "en";
window.AKBORU.subscribers = [];
window.AKBORU.onLangChange = (fn) => window.AKBORU.subscribers.push(fn);

function detectInitialLang() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && LANGS[saved]) return saved;
  const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
  if (LANGS[nav]) return nav;
  return "en";
}

function translate(key, lang) {
  const entry = DICT[key];
  if (!entry) return key;
  return entry[lang] || entry.en || key;
}
window.AKBORU.translate = translate;

function applyLang(lang) {
  const meta = LANGS[lang];
  if (!meta) return;
  const html = document.documentElement;
  html.lang = lang;
  html.dir = meta.dir;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = translate(key, lang);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    el.innerHTML = translate(key, lang);
  });
  document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    const spec = el.getAttribute("data-i18n-attr"); // "attr:key"
    spec.split(",").forEach((pair) => {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, translate(key, lang));
    });
  });

  // Update switcher labels + page title
  const toggleLabel = document.querySelector(".lang-switcher .lang-current");
  if (toggleLabel) toggleLabel.textContent = meta.short;
  document.querySelectorAll(".lang-menu button").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === lang);
  });
  const titleKey = document.documentElement.getAttribute("data-page-title-key");
  if (titleKey) document.title = translate(titleKey, lang);

  localStorage.setItem(STORAGE_KEY, lang);
  (window.AKBORU.subscribers || []).forEach((fn) => { try { fn(lang); } catch (e) {} });
}
window.AKBORU.applyLang = applyLang;

function buildSwitcher() {
  const containers = document.querySelectorAll("[data-lang-switcher]");
  containers.forEach((container) => {
    container.classList.add("lang-switcher");
    container.innerHTML = `
      <button type="button" class="lang-toggle" aria-haspopup="menu" aria-expanded="false">
        <span class="material-symbols-outlined" style="font-size:16px;">language</span>
        <span class="lang-current">EN</span>
        <span class="material-symbols-outlined" style="font-size:14px;">expand_more</span>
      </button>
      <div class="lang-menu" role="menu">
        ${Object.entries(LANGS).map(([code, meta]) =>
          `<button type="button" role="menuitem" data-lang="${code}">
            <span>${meta.label}</span><span>${meta.short}</span>
          </button>`).join("")}
      </div>`;
    const toggle = container.querySelector(".lang-toggle");
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      container.classList.toggle("open");
      toggle.setAttribute("aria-expanded", container.classList.contains("open"));
    });
    container.querySelectorAll(".lang-menu button").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyLang(btn.dataset.lang);
        container.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  });

  document.addEventListener("click", () => {
    document.querySelectorAll(".lang-switcher.open").forEach((s) => s.classList.remove("open"));
  });
}

function wireMobileMenu() {
  const trigger = document.querySelector("[data-mobile-trigger]");
  const menu = document.querySelector("[data-mobile-menu]");
  if (!trigger || !menu) return;
  trigger.addEventListener("click", () => menu.classList.toggle("open"));
}

document.addEventListener("DOMContentLoaded", () => {
  buildSwitcher();
  wireMobileMenu();
  applyLang(detectInitialLang());
});
