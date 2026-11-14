# Research notes

Background facts used to design the two Rezote apps and their demo data. Content is paraphrased from the linked sources. Figures marked *assumption* are not from a source and must be checked before the demo.

## Collecte: cotton cooperatives in Mali

### How weighing works today

- At the end of the season, each farm brings its harvest to the village weighing session. Each tarpaulin bundle (*bâche*) is weighed on a platform scale (*pont-bascule*) and the weight is called out aloud. ([Openedition, "La pesée du coton"](https://books.openedition.org/enseditions/5086))
- Three members of the village association write the same weights in three separate notebooks. After each weighing they add the weight to the running subtotal, so that if the notebooks disagree it is easy to find the line with the error. The total weight is then multiplied by the purchase price to get the farmer's expected income. (same source)
- The cotton of the whole village goes to the association's store and then by CMDT truck to the ginning factory. Weighing or calculation errors show up as a gap between the village total and the weight measured at the factory, and the whole association is responsible for that gap. (same source)
- The weight decides most of the farm's yearly cash income. (same source)

**Design consequences:** record each bundle as a separate weighing with a running subtotal; replace the three notebooks with one shared, synced record; record each truckload's village weight and factory weight and show the gap.

### Prices and inputs

- Cotton seed, first grade (*1er choix*): 300 FCFA/kg, fixed at the 15th session of the Conseil supérieur de l'agriculture in May 2025, up from 295 FCFA. ([Maliweb](https://www.maliweb.net/economie/agriculture/campagne-agricole-2025-pas-de-changement-de-prix-pour-lengrais-et-le-prix-du-coton-graine-3104603.html), [Mali Actu](https://maliactu.net/15e-session-du-csa-quel-avenir-pour-le-prix-du-coton-et-le-deuxieme-choix/))
- Second grade (*2e choix*): no price was announced in 2025 ([Bamada](https://bamada.net/15e-session-du-csa-quid-du-prix-du-coton-2e-choix)). In 2023/24, the prices were 295 FCFA (first grade) and 270 FCFA (second grade) ([Studio Tamani](https://www.studiotamani.org/155480-le-mali-nouveau-leader-du-coton-en-afrique)). The demo uses 275 FCFA for second grade (*assumption*).
- I did not find a published price for the 2026/27 campaign. The demo uses 300 FCFA/kg. Prices are set per campaign in the app, so this is easy to change.
- Subsidized mineral fertilizer: 14,000 FCFA per 50 kg bag in 2024 and 2025. ([Maliweb](https://www.maliweb.net/economie/agriculture/campagne-agricole-2025-pas-de-changement-de-prix-pour-lengrais-et-le-prix-du-coton-graine-3104603.html))
- Input debts are deducted from farmers' cotton income: in 2012, farmers around Fana protested against a compulsory deduction taken from their cotton income to repay internal debts. ([Maliweb](https://www.maliweb.net/economie/cmdt-textile/cmdt-la-revolte-des-producteurs-de-markacoungo-et-de-fana-51872.html))
- Payment delays are common: by June 24, 2025, about 63% of the 171 billion FCFA owed to farmers for 2024/25 had been paid. ([Studio Tamani](https://www.studiotamani.org/190327-le-gouvernement-sacquitte-de-la-dette-des-cotonculteurs-pour-la-campagne-2024-2025))

**Design consequences:** support deductions per farmer (for example fertilizer on credit); track partial payments over months.

### Scale

- Mali produced about 640,000 tonnes of cotton seed in the 2024/25 campaign. ([Maliweb](https://www.maliweb.net/economie/agriculture/campagne-agricole-2025-pas-de-changement-de-prix-pour-lengrais-et-le-prix-du-coton-graine-3104603.html))
- Production is mostly by small family farms. ([Le360](https://afrique.le360.ma/economie/la-production-a-bondi-de-77-le-mali-file-un-bon-coton-voici-pourquoi_WWD6HJBKEZHGVM2BI6UCHQFPIA/))

### Other products the template could serve

- Shea kernels: Mali set a minimum farm-gate price of 250 FCFA/kg for good-quality kernels. ([Agence Ecofin](https://www.agenceecofin.com/actualites-agro/0109-131099-mali-le-prix-minimum-bord-champ-du-karite-est-fixe-a-250-francs-cfa/kg)) Shea is collected almost entirely by women, often in cooperatives.
- Mali produces more than 200,000 tonnes of shea kernels and about 50,000 tonnes of sesame per year. ([Journal du Mali](https://journaldumali.com/filieres-oleagineuses-le-gouvernement-malien-reunit-producteurs-et-industriels-a-bamako/))

## Carnet de route: truck corridors to Mali

### Corridors

- Dakar and Abidjan are Mali's two main ports. Freight from Dakar used to take the northern road through Tambacounda, Kidira, and Kayes. ([Financial Afrik, Oct 2026](https://www.financialafrik.com/2026/10/15/corridor-dakar-bamako-la-route-sud-ne-peut-pas-porter-seule-le-mali/))
- Since the Kidira road closed, Dakar freight goes through Kédougou and the Moussala border post. On October 1, 2026, the truck queue at Moussala was several tens of kilometers long. The Bamako–Kéniéba road is the Malian side of this southern corridor, and drivers' unions have complained about its condition. (same source)
- The southern corridor runs through Kédougou, Saraya, and Moussala. ([Seneweb](https://www.seneweb.com/news/Societe/nouveau-corridor-par-le-sud-les-usagers-gagnent-200-km-sur-l-rsquo-axe-dakar-bamako_n_97410.html))
- The Abidjan corridor crosses the border at Pogo (Côte d'Ivoire) and Zégoua (Mali), then continues to Bamako. ([PWIC Côte d'Ivoire](https://pwic.ci/en/procedures/transit-corridor-mali/fiche.pdf))
- In August 2026, a queue of about 15 km was reported at Moussala. Waiting conditions for drivers are hard, and longer transit times add costs for transporters. ([RFI via Yahoo](https://fr.news.yahoo.com/s%C3%A9n%C3%A9gal-mali-transporteurs-veulent-am%C3%A9liorer-231315784.html))

### Security

- The JNIM fuel blockade announced in September 2025 was reinstated at the end of April 2026. The Kidira–Kayes road is the most exposed to attacks, and tankers travel only under military escort. ([Financial Afrik](https://www.financialafrik.com/2026/10/15/corridor-dakar-bamako-la-route-sud-ne-peut-pas-porter-seule-le-mali/))
- On January 29, 2026, an attack on a tanker convoy near Kayes killed at least a dozen drivers. ([RFI](https://www.rfi.fr/fr/afrique/20260203-au-mali-l-approvisionnement-en-carburant-plie-mais-ne-rompt-pas))

**Design consequences:** a truck's position is life-safety data. Event contents are encrypted on the phone, so the server operator cannot see them. GPS is off by default. Waiting for a military convoy is an entry kind, and its waiting time is measured.

### Fuel prices

- Mali, regulated pump price for diesel (*gasoil*): 940 FCFA/L since March 28, 2026, up from 725 FCFA. ([Xinhua](http://french.xinhuanet.com/20260328/91764f845cd34d4dbd1870493cfa0cdf/c.html), [DW](https://www.dw.com/fr/la-guerre-en-iran-influencerait-le-prix-du-carburant-au-mali/a-76631334))
- Senegal, diesel: 755 FCFA/L since August 15, 2026. ([SeneNews](https://www.senenews.com/actualites/carburants-990-f-cfa-litre-le-senegal-parmi-les-pays-les-plus-chers-de-luemoa_597817.html))
- Côte d'Ivoire, diesel: 725 FCFA/L since August 1, 2026, and still at that price in September. ([AIP](https://www.aip.ci/cote-divoire-aip-les-prix-du-carburant-augmentent-a-la-pompe-pour-le-mois-daout-2026/), [L-Frii](https://yop.l-frii.com/prix-du-carburant-voici-les-tarifs-appliques-en-cote-divoire-en-septembre/))
- Outside Bamako, fuel is often scarce, and black-market prices are much higher. ([RFI](https://www.rfi.fr/fr/afrique/20260107-au-mali-l-acc%C3%A8s-au-carburant-se-stabilise-%C3%A0-bamako-mais-reste-compliqu%C3%A9-en-r%C3%A9gion))

**Design consequences:** fuel entries record liters and price per liter, not just the total, and an optional odometer reading lets the owner see consumption per 100 km.

## Still to check (by you)

- Typical weight of one cotton bundle and number of bundles per farm (demo uses 40 to 120 kg per bundle, *assumption*).
- Whether cooperatives use a paper receipt per weighing today.
- Typical amounts for checkpoints, weighbridges, and customs on each corridor (demo amounts are *assumptions*).
- Exact towns on the Malian side of the southern corridor between Moussala and Bamako.
