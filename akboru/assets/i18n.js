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
  "footer.address":   { tr: "Türkiye merkezli. Küresel teslimat.",
                        de: "Hauptsitz Türkei. Weltweite Lieferung.",
                        en: "Headquartered in Türkiye. Global delivery.",
                        ar: "المقر الرئيسي في تركيا. توصيل عالمي." },

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
                             en: "Yield Analysis", ar: "تحليل العائد" }
};

const STORAGE_KEY = "akboru.lang";

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
}

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
