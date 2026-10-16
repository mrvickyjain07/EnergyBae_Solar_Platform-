// Proposal Maker — static company / legal copy, verbatim from the real
// EnergyBae proposal. Shared by exportDocx.ts (the one-click template
// export) and the on-screen editable proposal preview, so both stay in
// sync from one source instead of two hand-copied blocks of text.

export const ABOUT_US = [
  `EnergyBae (Formerly Develop Train Maintain) is a decentralised Renewable Energy Start-up empowering people to power themselves. We bridge the gap between EPC contractors and end customers with the aim to help a customer choose the right Renewables options. We ensure smooth and quality project Installation and Commissioning. We have more than 6 years of experience in the Renewable industry including Renewable R&D. We have also developed a hybrid turbine called “Wayumitra” for places with extreme monsoons.`,
  `We are engaged in EPC of various types of Renewable Projects like On-grid, Off-grid, Ground mounted Solar, Solar Pumping, Wind Turbine, Solar-Wind Hybrids, and Bio-gas Projects. We provide specialised services for the Renewable industry.`,
  `With an eye on quality and in-house design expertise, we ensure that all our installations are at par with the best in the industry. Our single-minded focus on quality means that our clients can recoup their investments quicker and enjoy the uninterrupted benefits that Renewable energy has to offer.`,
  `EnergyBae Pvt. Ltd has partnered with leading Solar modules, Wind turbines, Bio-gas manufacturers and suppliers to ensure that our customers get the best technology with exceptional service.`,
  `Connect with us to discuss how EnergyBae can be your preferred partner in your journey to be environmentally friendly and reduce your carbon footprint.`,
];

export const SCOPE_SECTIONS: { title: string; items: string[] }[] = [
  {
    title: "I. Detailed site analysis:",
    items: [
      "Site survey - elevation, shade, obstacles",
      "Location of lightning arrestors",
      "Location of grounding for junction boxes/strings/inverters",
      "Location of inverters",
      "DC/AC Wire-routing till Inverter/Distribution Panel",
    ],
  },
  {
    title: "II. Design:",
    items: [
      "Detailed layout of the solar power plant including cable routing",
      "Design and optimization of solar mounting structures as per AISI standards considering: Wind speed, Seismic zone, Corrosion prevention",
      "Panel layout of the solar power plant",
      "SLD (Single line diagram) for solar power plant",
      "Detailed DC electrical wiring layout",
      "Detailed AC wiring layout till LT/Distribution panel",
    ],
  },
  {
    title: "III. Execution:",
    items: [
      "Civil foundation/Structure fixing/ Installation of RCC roof/Tin Shed/ Asbestos shed and cable laying till LT panel",
      "Mounting structure erection",
      "Module installation",
      "DC wiring",
      "AC wiring till LT panel",
      "Inverter installation",
      "LT Panel connection",
    ],
  },
  {
    title: "IV. Commissioning of the solar power plant:",
    items: ["Commissioning of power plant up to internal grid connection", "Configuration of inverters and load checking"],
  },
];

export const PROJECT_HIGHLIGHTS = [
  "Reputed Panel and Inverter",
  "8-10 years Inverter Warranty",
  "MSEDCL Net Metering and Liaisoning Charges Included",
  "5-year AMC and Solar Insurance Included.",
];
export const PROJECT_HIGHLIGHTS_TAIL = [
  "Name Change Charges if Required will be extra at actual.",
  "Sanction Load Increase at Actual as per MSEDCL Quotation.",
  "EnergyBae will put one hoarding board showcasing your premises adopted green Energy in technical collaboration with Energy Bae Private Limited.",
];
export const SERVICE_GUARANTEE = [
  "Service Visit within 72 hours.",
  "Max. Inverter Repair/ Replacement time 7 days.",
  "Temporary Inverter to be installed in case of Extended period for Repair.",
];

export const ROLES_RESPONSIBILITIES: [string, string, string][] = [
  ["1.", "Project Approval from Local DISCOM", "EnergyBae Private Limited"],
  ["2.", "Material Safety & Access to the Roof", "Customer"],
  ["3.", "STADD report (if required, the customer needs to inform in advance and will need to pay extra)", "EnergyBae Private Limited"],
  ["4.", "Load & Load Bearing Capacity", "Customer & EnergyBae Private Limited"],
  ["5.", "Civil Work", "EnergyBae Private Limited"],
  ["6.", "Electrical Work", "EnergyBae Private Limited"],
  ["7.", "Installation & Commissioning", "EnergyBae Private Limited"],
  ["8.", "Power Supply During Installation", "Customer"],
  ["9.", "Permission to work on Roof/Pre-Drill Foundation", "Customer"],
  ["10.", "Net Meter Liaisoning with Local DISCOM", "EnergyBae Private Limited"],
  ["11.", "Net Meter & Testing Charges", "EnergyBae Private Limited"],
  ["12.", "DISCOM Interconnect charges if Any", "Customer"],
  ["13.", "Earthing & Lightning Protection Kit", "EnergyBae Private Limited"],
  ["14.", "Permission to work on Weekends/Holidays", "Customer"],
  ["15.", "Panel Cleaning", "Customer"],
  ["16.", "Permission to take remaining material from Site", "Customer"],
];

export function buildTermsRows(gstPct: number): { term: string; bullets: { text: string; lvl?: number }[] }[] {
  return [
    { term: "Validity of the Quote", bullets: [{ text: "10 Days From the date of submission" }] },
    { term: "Project Execution Time Frame", bullets: [{ text: "60 Days from the date of approval from DISCOM" }] },
    {
      term: "Terms of Payment",
      bullets: [
        { text: "20% Advance with PO", lvl: 0 },
        { text: "50% After MSEDCL Approval.", lvl: 0 },
        { text: "10% After Delivery of Solar Panels and Inverter.", lvl: 0 },
        { text: "15% After Installation of Solar Panels and Inverter.", lvl: 0 },
        { text: "5% After Installation of Meter.", lvl: 0 },
        { text: "Prices are based on standard site conditions and one-time execution. Any additional manpower, machinery, rework, or access constraints beyond the defined scope will be charged extra at actuals with client approval." },
      ],
    },
    { term: "Remote Monitoring", bullets: [{ text: "Wi-fi Connection in Clients’ Scope" }] },
    {
      term: "Warranty",
      bullets: [
        { text: "5 Years from the date of Commissioning on Inverters", lvl: 0 },
        { text: "12 years Product Warranty + 30 years Performance Warranty on Solar Modules", lvl: 0 },
        { text: "Structure/BOS as per supplier", lvl: 0 },
        { text: "Exclusions: The warranty will not be applicable under following conditions:", lvl: 0 },
        { text: "Product that has been unkempt, damaged, subjected to misuse, abnormal service or handling, or not maintained as per product manual.", lvl: 1 },
        { text: "Any unauthorized tampering on the electrical parts and connections.", lvl: 1 },
        { text: "Any damage to the electrical component due to heavy fault on account of abnormal conditions in the local grid.", lvl: 1 },
        { text: "Product that has been subjected to abnormal environmental conditions such as acid rain or other similar conditions, viz. unprecedented heavy winds & rains etc.", lvl: 1 },
        { text: "Damages caused by Fire, Natural Calamities (like flood, storm, landslide, etc.) & Man-made calamities (theft, burglary, strike, riot, terrorism, etc.).", lvl: 1 },
      ],
    },
    { term: "Insurance", bullets: [{ text: "To be provided to the Customer once the plant is commissioned." }] },
    {
      term: "Taxes",
      bullets: [
        { text: "GST rates are applied as per applicable HSN classification for individual components and services.", lvl: 0 },
        { text: `GST @ ${gstPct.toFixed(1)}% to be charged extra on Solar/Wind Project. (5% GST -> 70% Project Cost & 18% GST -> 30% Project Cost)`, lvl: 1 },
        { text: "5% GST -> Solar Panels, Wind Turbine, Solar On-Grid Inverters and Parts.", lvl: 1 },
        { text: "18% GST -> Services, Installation, Metal Parts & all other components", lvl: 1 },
        { text: "GST rates shall be as applicable at the time of billing. Any additional tax, duty, or levy arising due to a change in tax law shall be payable by the Customer at actuals.", lvl: 0 },
      ],
    },
    { term: "Others", bullets: [{ text: "Projects are subject to Force Majeure conditions beyond reasonable control." }] },
    {
      term: "Marketing",
      bullets: [
        { text: "EnergyBae Private Limited may use photographs and videos of the installed system at the Client’s premises, along with the Client’s name, for marketing, promotional, and reference purposes, including use on its website, brochures, proposals, presentations, and digital marketing platforms.", lvl: 0 },
        { text: "Such use will be limited to showcasing the project and the Client’s adoption of green energy solutions.", lvl: 0 },
        { text: "EnergyBae branding may appear on system components such as the turbine nameplate and inverter, as per standard installation practice.", lvl: 0 },
      ],
    },
  ];
}

export const ANNEXURE_SECTIONS: { title: string; numbered?: string[]; plain?: string[]; bullets?: string[] }[] = [
  {
    title: "Solar Photovoltaic Modules",
    numbered: [
      "The Photovoltaic modules will be tested and certified by an independent testing laboratory that is accredited in accordance with ISO Guide 25. The module type will be qualified as per IEC 61215 latest Edition or IEEE 1262 or CEC 503 for Crystalline silicon. SPV module conversion efficiency will be equal to or greater than 16% under STC and AM 1.5 radiation. Modules will qualify to IEC 61730 Part I and II for safety qualification testing. Certificate for module qualification from IEC or equivalent to be submitted as part of the bid offer. Self-undertaking from manufacturer / supplier that the modules being supplied are as per above. Only indigenously manufactured SPV modules shall be supplied.",
      "The PV module shall perform satisfactorily in humidity up to 100% with temperature between –40°C to + 85°C. Since the modules would be used in a high voltage circuit, the high voltage insulation test shall be carried out on each module and a test certificate to that effect provided.",
      "Maximum degradation not more than 10% at the end of 10 years and 20% at the end of 25 years.",
      "The supply of PV modules using RF identification tag (RFID), which will contain the following information: name of the manufacturer of PV Module; name of the manufacturer of solar cells; month and year of manufacture (separately for solar cells and module); country of origin (separately for solar cells and module); I-V curve for the module; peak wattage, Im, Vm and FF for the module; unique serial no and model no of the module; date and year of obtaining IEC PV module qualification certificate; name of the test lab issuing IEC certificate; and other relevant information on traceability of solar cells and modules as per ISO 9000 series.",
      "Except where specified, the front module surface will consist of impact resistant, low-iron and high-transmission toughened glass.",
      "The module frame, if any, will be made of a corrosion-resistant material which will be electrolytically compatible with the structural material used for mounting the modules.",
      "The module will be provided with a junction box with either provision of external screw terminal connection or sealed type and with arrangement for provision of by-pass diode. The box will have a hinged, weather-proof lid with captive screws and cable gland entry points, or may be of sealed type and IP65 rated.",
    ],
  },
  {
    title: "Array Structure",
    plain: [
      "We will specify installation details of the PV modules and the support structures with appropriate diagrams and drawings. Such details will include, but not limited to the following:",
    ],
    numbered: [
      "Determination of true south at the site;",
      "Array tilt angle to the horizontal, with permitted tolerance;",
      "Details with drawings for fixing the modules;",
      "Details with drawings of fixing the junction/terminal boxes;",
      "Interconnection details inside the junction/terminal boxes;",
      "Structure installation details and drawings;",
      "Electrical grounding (earthing);",
      "Inter-panel/Inter-row distances with allowed tolerances;",
      "Safety precautions to be taken.",
    ],
    bullets: [
      "The array structure will support SPV modules at a given orientation to absorb and transfer the mechanical loads to the roof properly. The portion of array structure if any lying within the column will be of Pre-GI extruded section of superior quality. All nuts and bolts shall be of very good quality stainless steel. Detailed design and drawing of the module mounting structures will be given before execution of work.",
      "Pre-GI extruded frame structures with adequate strength and in accordance with relevant BIS standards shall be used, with proof that the design of the structure can withstand a wind speed of minimum 150 km per hour.",
      "Structures will be supplied complete with all members compatible for allowing easy installation at the rooftop site, with each structure having an angle of inclination as per site conditions to take maximum insolation, and capable of withstanding a wind load of 150 km/hr after grouting & installation.",
      "The structures will be designed for simple mechanical and electrical installation. There will be no requirement of welding or complex machinery at the installation site. Where prior civil work or a support platform is essential, the supplier will clearly communicate such requirements along with specifications, with detailed engineering drawings and instructions provided prior to supply of goods.",
    ],
  },
  {
    title: "Inverter",
    plain: [
      "The power conditioning units will be provided to convert DC power produced by SPV modules into AC power — a multifunction power conditioning system combining the functionality of a grid-interactive solar inverter with a highly efficient conversion unit, having the following technical specification (protections of PCU):",
    ],
    numbered: [
      "Authentic tracking of the solar array's maximum power operation voltage (MPPT).",
      "Array ground fault detection.",
      "LCD and piezoelectric keypad operator interface, menu driven.",
      "Automatic fault condition reset for all parameters like voltage, frequency and/or black-out.",
      "MOV and gas-filled spark-gap technology type surge arresters on AC and DC terminals for over-voltage surge protection from any source.",
      "PCU will be rated to operate at 0 to 55°C above ambient temperature.",
      "All parameters will be accessible through an industry-standard communication link.",
      "Overload capacity (for 30 seconds) should be 200% of continuous rating for battery inverters.",
      "The PCU will go into sleep mode when there is no grid supply.",
    ],
  },
  { title: "Maximum Power Point Tracker (MPPT) — Built into the PCU", plain: ["A maximum power point tracker will be integrated in the inverter to maximize energy drawn from the array. The MPPT will be microprocessor based to minimize power losses, with the working mechanism documented, and will have provision (manual setting) for constant voltage operation."] },
  { title: "DC Distribution Board", plain: ["The DC Distribution panel will receive the DC output from the array field with fuse and SPDs, so as to check any failure in the array field."] },
  {
    title: "AC Distribution Panel Board",
    plain: [
      "AC Distribution Panel Board (DPB) will control the AC power from the inverter and will have necessary surge arrestors. Interconnection from ACDB to mains at LT bus bar will be carried out and complete equipment along with metering will be installed in the ACDB. Requirements/specifications of DCDB and ACDB will be adjusted per site conditions. All switches, circuit breakers and connectors shall conform to IEC 60947, Part I, II and III.",
    ],
  },
  { title: "Remote Monitoring", plain: ["A suitable remote monitoring system will be provided to capture critical performance parameters of the rooftop system. Internet connectivity shall be in the scope of the Client."] },
  {
    title: "Cables & Wires",
    numbered: [
      "Cabling in the yard and control room: Cabling in the yard will be carried out as per IE Rules. All other cabling above ground would be suitably mounted on cable trays with proper covers. LSZH XLPE cables will be used.",
      "Wires: FRLS copper wires of appropriate size and reputed make will be used.",
      "Cable ends: All connections are made through suitable cable/lug/terminals, crimped properly and with use of cable glands.",
      "Cable marking: All cables/wires will be marked in a proper manner by good quality ferrule or by other means so that the cable can be easily identified.",
    ],
  },
  { title: "Lightning Protection", plain: ["The required number of suitable lightning arrestors will be installed in the array field. Lightning protection will be provided by the use of metal oxide varistors and suitable earthing such that induced transients find an alternate route to earth."] },
  { title: "Earthing Protection", plain: ["Each array structure of the PV yard will be grounded properly. In addition, the lightning arrester/masts will also be provided inside the array field, with provision for shorting and grounding of the PV array at the time of maintenance work."] },
];
