import type { TriviaQuestion, HistoricalBattle, ExplorationPath, ExplorerArchetype } from './knowledge-graph';

// ============================================================================
// Engagement Loops — Daily battles, trivia, paths, and archetypes
// Adapted from Ye Universe's proven retention mechanics
// ============================================================================

// ── Daily Battles ──────────────────────────────────────────────────────────

export const BATTLES: HistoricalBattle[] = [
  { id: 'b-leo-mike', entityA: 'leonardo-da-vinci', entityAType: 'person', entityB: 'michelangelo-buonarroti', entityBType: 'person', category: 'Clash of Titans', prompt: 'Who was the greater Renaissance genius?' },
  { id: 'b-newton-einstein', entityA: 'isaac-newton', entityAType: 'person', entityB: 'albert-einstein', entityBType: 'person', category: 'Clash of Titans', prompt: 'Who changed physics more?' },
  { id: 'b-darwin-curie', entityA: 'charles-darwin', entityAType: 'person', entityB: 'marie-curie', entityBType: 'person', category: 'Clash of Titans', prompt: 'Whose discovery had more impact on humanity?' },
  { id: 'b-press-telescope', entityA: 'gutenberg-printing-press', entityAType: 'event', entityB: 'galileo-telescope-observations', entityBType: 'event', category: 'Turning Points', prompt: 'Which invention changed the world more: the printing press or the telescope?' },
  { id: 'b-columbus-magellan', entityA: 'christopher-columbus', entityAType: 'person', entityB: 'ferdinand-magellan', entityBType: 'person', category: 'Clash of Titans', prompt: 'Whose voyage was more consequential?' },
  { id: 'b-mona-david', entityA: 'mona-lisa', entityAType: 'artifact', entityB: 'david-sculpture', entityBType: 'artifact', category: 'Art Wars', prompt: 'Which is the greater masterpiece?' },
  { id: 'b-gravity-evolution', entityA: 'gravity', entityAType: 'concept', entityB: 'evolution', entityBType: 'concept', category: 'Ideas That Changed Everything', prompt: 'Which idea transformed our understanding of the universe more?' },
  { id: 'b-copernicus-galileo', entityA: 'copernicus', entityAType: 'person', entityB: 'galileo-galilei', entityBType: 'person', category: 'Clash of Titans', prompt: 'Who deserves more credit for the heliocentric revolution?' },
  { id: 'b-renaissance-scirev', entityA: 'renaissance', entityAType: 'era', entityB: 'scientific-revolution', entityBType: 'era', category: 'Eras', prompt: 'Which era contributed more to modern civilization?' },
  { id: 'b-principia-origin', entityA: 'principia-mathematica', entityAType: 'artifact', entityB: 'origin-of-species-book', entityBType: 'artifact', category: 'Books That Changed Everything', prompt: 'Which book had a greater impact on human thought?' },
  { id: 'b-medici-machiavelli', entityA: 'lorenzo-de-medici', entityAType: 'person', entityB: 'niccolo-machiavelli', entityBType: 'person', category: 'Power & Ideas', prompt: 'Who understood power better: the ruler or the theorist?' },
  { id: 'b-dna-relativity', entityA: 'dna-structure-discovered', entityAType: 'event', entityB: 'einstein-special-relativity', entityBType: 'event', category: 'Turning Points', prompt: 'Which discovery matters more for humanity\'s future?' },
  { id: 'b-plague-exploration', entityA: 'black-death', entityAType: 'event', entityB: 'columbus-first-voyage', entityBType: 'event', category: 'What If?', prompt: 'Which event reshaped civilization more dramatically?' },
  { id: 'b-compass-press', entityA: 'compass', entityAType: 'artifact', entityB: 'printing-press', entityBType: 'artifact', category: 'Inventions', prompt: 'Which invention was more transformative?' },
  { id: 'b-sistine-supper', entityA: 'sistine-chapel-ceiling', entityAType: 'event', entityB: 'last-supper-painted', entityBType: 'event', category: 'Art Wars', prompt: 'Which is the greater artistic achievement?' },
  { id: 'b-mendeleev-darwin', entityA: 'dmitri-mendeleev', entityAType: 'person', entityB: 'charles-darwin', entityBType: 'person', category: 'Scientists', prompt: 'Whose organizational insight was more brilliant: the periodic table or the tree of life?' },
  { id: 'b-curie-franklin', entityA: 'marie-curie', entityAType: 'person', entityB: 'rosalind-franklin', entityBType: 'person', category: 'Overlooked Brilliance', prompt: 'Who faced greater obstacles to their scientific legacy?' },
  { id: 'b-apollo-lhc', entityA: 'apollo-11-moon-landing', entityAType: 'event', entityB: 'higgs-boson-discovery', entityBType: 'event', category: 'Modern Science', prompt: 'Which is the greater achievement of modern science?' },
  { id: 'b-zhenghe-columbus', entityA: 'zheng-he', entityAType: 'person', entityB: 'christopher-columbus', entityBType: 'person', category: 'Explorers', prompt: 'Whose voyages were more impressive?' },
  { id: 'b-calculus-periodic', entityA: 'calculus', entityAType: 'concept', entityB: 'periodic-table', entityBType: 'concept', category: 'Ideas', prompt: 'Which organizational framework was more revolutionary?' },

  // Ancient World & Medieval
  { id: 'b-alexander-genghis', entityA: 'per-aw-alexander', entityAType: 'person', entityB: 'per-genghis-khan', entityBType: 'person', category: 'Clash of Titans', prompt: 'Who was the greater conqueror: Alexander the Great or Genghis Khan?' },
  { id: 'b-caesar-augustus', entityA: 'per-aw-julius-caesar', entityAType: 'person', entityB: 'per-aw-augustus', entityBType: 'person', category: 'Clash of Titans', prompt: 'Caesar vs Augustus: who was the greater Roman leader?' },
  { id: 'b-napoleon-hannibal', entityA: 'per-napoleon', entityAType: 'person', entityB: 'per-aw-hannibal', entityBType: 'person', category: 'Clash of Titans', prompt: 'Who had more strategic genius: Napoleon or Hannibal?' },
  { id: 'b-socrates-confucius', entityA: 'per-aw-socrates', entityAType: 'person', entityB: 'per-aw-confucius', entityBType: 'person', category: 'Clash of Titans', prompt: 'Whose philosophy shaped more minds: Socrates or Confucius?' },
  { id: 'b-leonidas-saladin', entityA: 'per-aw-leonidas', entityAType: 'person', entityB: 'per-saladin', entityBType: 'person', category: 'Clash of Titans', prompt: 'Who was the more honorable warrior: Leonidas or Saladin?' },
  { id: 'b-cleopatra-eleanor', entityA: 'per-aw-cleopatra', entityAType: 'person', entityB: 'per-eleanor-aquitaine', entityBType: 'person', category: 'Power & Ideas', prompt: 'Who wielded power more effectively: Cleopatra or Eleanor of Aquitaine?' },
  { id: 'b-rome-mongol', entityA: 'evt-aw-pax-romana', entityAType: 'event', entityB: 'evt-mongol-empire-founded', entityBType: 'event', category: 'Empires', prompt: 'Which empire brought more order to the world: Rome or the Mongols?' },
  { id: 'b-magna-carta-12tables', entityA: 'evt-magna-carta', entityAType: 'event', entityB: 'evt-aw-twelve-tables', entityBType: 'event', category: 'Turning Points', prompt: 'Which document mattered more for the rule of law: the Magna Carta or the Twelve Tables?' },
  { id: 'b-archimedes-alkhwarizmi', entityA: 'per-aw-archimedes', entityAType: 'person', entityB: 'per-al-khwarizmi', entityBType: 'person', category: 'Scientists', prompt: 'Who contributed more to mathematics: Archimedes or Al-Khwarizmi?' },
  { id: 'b-charlemagne-qin', entityA: 'per-charlemagne', entityAType: 'person', entityB: 'per-aw-qin-shi-huang', entityBType: 'person', category: 'Empires', prompt: 'Who was the greater empire builder: Charlemagne or Qin Shi Huang?' },

  // Modern Era
  { id: 'b-american-french-rev', entityA: 'evt-declaration-independence', entityAType: 'event', entityB: 'evt-storming-bastille', entityBType: 'event', category: 'Turning Points', prompt: 'Which revolution changed more: American or French?' },
  { id: 'b-gandhi-mlk', entityA: 'per-20c-gandhi', entityAType: 'person', entityB: 'per-20c-mlk', entityBType: 'person', category: 'Clash of Titans', prompt: 'Gandhi vs MLK: whose approach to nonviolence was more effective?' },
  { id: 'b-washington-bolivar', entityA: 'per-washington', entityAType: 'person', entityB: 'per-bolivar', entityBType: 'person', category: 'Clash of Titans', prompt: 'Who was the greater liberator: Washington or Bolivar?' },
  { id: 'b-napoleon-bismarck', entityA: 'per-napoleon', entityAType: 'person', entityB: 'per-bismarck', entityBType: 'person', category: 'Power & Ideas', prompt: 'Who reshaped Europe more: Napoleon or Bismarck?' },
  { id: 'b-lincoln-douglass', entityA: 'per-lincoln', entityAType: 'person', entityB: 'per-douglass', entityBType: 'person', category: 'Power & Ideas', prompt: 'Who did more to end slavery: Lincoln or Douglass?' },

  // 20th Century
  { id: 'b-churchill-fdr', entityA: 'per-20c-churchill', entityAType: 'person', entityB: 'per-20c-fdr', entityBType: 'person', category: 'Clash of Titans', prompt: 'Who was the greater wartime leader: Churchill or FDR?' },
  { id: 'b-mandela-gandhi', entityA: 'per-20c-mandela', entityAType: 'person', entityB: 'per-20c-gandhi', entityBType: 'person', category: 'Clash of Titans', prompt: 'Whose liberation struggle was more transformative: Mandela or Gandhi?' },
  { id: 'b-turing-oppenheimer', entityA: 'per-20c-turing', entityAType: 'person', entityB: 'per-20c-oppenheimer', entityBType: 'person', category: 'Scientists', prompt: 'Whose invention changed the world more: Turing\'s computer or Oppenheimer\'s bomb?' },
  { id: 'b-moon-hiroshima', entityA: 'evt-20c-moon-landing', entityAType: 'event', entityB: 'evt-20c-hiroshima', entityBType: 'event', category: 'What If?', prompt: 'Which moment better defines the 20th century: the Moon landing or Hiroshima?' },
  { id: 'b-wwi-wwii', entityA: 'evt-20c-wwi-outbreak', entityAType: 'event', entityB: 'evt-20c-wwii-outbreak', entityBType: 'event', category: 'Turning Points', prompt: 'Which World War changed civilization more?' },
];

// ── Daily Trivia ──────────────────────────────────────────────────────────

export const TRIVIA: TriviaQuestion[] = [
  { id: 't-1', question: 'What did Galileo observe through his telescope that proved the Earth was not the center of the universe?', options: ['Moons orbiting Jupiter', 'The rings of Saturn', 'A comet approaching Earth', 'Sunspots on the Sun'], correctIndex: 0, explanation: 'Galileo observed four moons orbiting Jupiter in 1610, proving that not everything orbited the Earth — demolishing the geocentric model.', difficulty: 'easy', domainIds: ['science'], relatedEntityId: 'galileo-telescope-observations', relatedEntityType: 'event' },
  { id: 't-2', question: 'Why did Leonardo da Vinci write his notebooks in mirror script?', options: ['To encrypt his ideas from the Church', 'He was left-handed and it was more natural', 'He had a secret code system', 'His teacher taught him this way'], correctIndex: 1, explanation: 'Leonardo was left-handed, and writing from right to left prevented smudging the ink. While it served as a form of privacy, the primary reason was practical.', difficulty: 'medium', domainIds: ['art', 'science'], relatedEntityId: 'leonardo-da-vinci', relatedEntityType: 'person' },
  { id: 't-3', question: 'What was the Columbian Exchange?', options: ['A trade agreement between Spain and Portugal', 'The transfer of plants, animals, and diseases between the Old and New Worlds', 'Columbus\'s system of trading gold for supplies', 'The name for the first European stock exchange'], correctIndex: 1, explanation: 'The Columbian Exchange was the massive transfer of plants (tomatoes, potatoes, corn), animals (horses, cattle), and diseases (smallpox) between the Americas and Europe/Africa/Asia after 1492.', difficulty: 'easy', domainIds: ['exploration'], relatedEntityId: 'columbian-exchange', relatedEntityType: 'event' },
  { id: 't-4', question: 'Who actually produced the crucial X-ray photograph that revealed DNA\'s structure?', options: ['James Watson', 'Francis Crick', 'Rosalind Franklin', 'Linus Pauling'], correctIndex: 2, explanation: 'Rosalind Franklin\'s "Photo 51" was the key X-ray crystallography image that revealed DNA\'s helical structure. Watson and Crick used it (without her permission) to build their famous model.', difficulty: 'medium', domainIds: ['science'], relatedEntityId: 'dna-structure-discovered', relatedEntityType: 'event' },
  { id: 't-5', question: 'What happened to Gutenberg after he invented the printing press?', options: ['He became the richest man in Europe', 'He was knighted by the Pope', 'He lost the press in a lawsuit from his investor', 'He opened printing shops across Germany'], correctIndex: 2, explanation: 'Johann Fust sued Gutenberg for repayment of his investment, won the case, and took possession of the press and the nearly-complete Bibles. Gutenberg died in relative obscurity.', difficulty: 'hard', domainIds: ['technology'], relatedEntityId: 'johannes-gutenberg', relatedEntityType: 'person' },
  { id: 't-6', question: 'How long did Copernicus delay publishing his heliocentric theory?', options: ['5 years', 'About 10 years', 'About 30 years', 'He never published — it was published after his death without delay'], correctIndex: 2, explanation: 'Copernicus circulated his ideas privately (in the Commentariolus) around 1514 but delayed full publication until 1543 — approximately 30 years — partly out of fear of controversy.', difficulty: 'medium', domainIds: ['science'], relatedEntityId: 'copernicus', relatedEntityType: 'person' },
  { id: 't-7', question: 'What was Newton doing when he developed calculus and his theory of gravity?', options: ['Teaching at Cambridge University', 'Hiding from the plague at his family farm', 'Working at the Royal Mint', 'Studying under Robert Hooke'], correctIndex: 1, explanation: 'Cambridge University closed due to the plague in 1665-1666. Newton retreated to Woolsthorpe Manor, his family farm, where he had his "annus mirabilis" — developing calculus, optics, and his first ideas about gravity.', difficulty: 'medium', domainIds: ['science'], relatedEntityId: 'isaac-newton', relatedEntityType: 'person' },
  { id: 't-8', question: 'Why was Machiavelli\'s "The Prince" written?', options: ['As a philosophical treatise on ideal government', 'As a job application to win favor with the Medici', 'As a satire mocking tyrannical rulers', 'As a textbook for his university students'], correctIndex: 1, explanation: 'Machiavelli had been exiled and tortured after the Medici returned to power. He wrote The Prince and dedicated it to Lorenzo de Medici, hoping to demonstrate his political expertise and earn a position in government.', difficulty: 'hard', domainIds: ['politics', 'philosophy'], relatedEntityId: 'niccolo-machiavelli', relatedEntityType: 'person' },
  { id: 't-9', question: 'What did Marie Curie refuse to do with her discovery of radium?', options: ['Publish her findings', 'Share credit with Pierre', 'Patent it', 'Accept the Nobel Prize'], correctIndex: 2, explanation: 'Marie Curie refused to patent radium or the process of isolating it. She believed scientific discoveries should benefit all of humanity, not generate private wealth. She died in relative poverty.', difficulty: 'medium', domainIds: ['science'], relatedEntityId: 'marie-curie', relatedEntityType: 'person' },
  { id: 't-10', question: 'What did Einstein do for a living when he published his four groundbreaking 1905 papers?', options: ['Professor of physics at ETH Zurich', 'Patent clerk in Bern', 'Research assistant at the Berlin Academy', 'Freelance physics tutor'], correctIndex: 1, explanation: 'Einstein was a third-class patent examiner at the Swiss Patent Office in Bern. No university would hire him. He revolutionized physics between reviewing patent applications.', difficulty: 'easy', domainIds: ['science'], relatedEntityId: 'albert-einstein', relatedEntityType: 'person' },
  { id: 't-11', question: 'The Pazzi conspiracy of 1478 targeted which family?', options: ['The Borgia family', 'The Medici family', 'The Sforza family', 'The Este family'], correctIndex: 1, explanation: 'The Pazzi conspiracy was a plot to assassinate Lorenzo and Giuliano de Medici during Easter Mass in the Florence Cathedral. Giuliano was killed; Lorenzo survived with a wound to his neck.', difficulty: 'easy', domainIds: ['politics'], relatedEntityId: 'pazzi-conspiracy', relatedEntityType: 'event' },
  { id: 't-12', question: 'What percentage of Europe\'s population did the Black Death kill?', options: ['About 10%', 'About 30-60%', 'About 75%', 'About 90%'], correctIndex: 1, explanation: 'The Black Death (1347-1353) killed an estimated 30-60% of Europe\'s population — between 75 and 200 million people. Some regions lost even more.', difficulty: 'easy', domainIds: ['medicine'], relatedEntityId: 'black-death', relatedEntityType: 'event' },
  { id: 't-13', question: 'Mendeleev\'s periodic table was revolutionary because he...', options: ['Identified all elements known at the time', 'Left gaps for elements not yet discovered', 'Organized elements by color and density', 'Was the first to count protons'], correctIndex: 1, explanation: 'Mendeleev not only arranged known elements by atomic weight and properties, but boldly left gaps for undiscovered elements and predicted their properties. When gallium, scandium, and germanium were later discovered, his predictions were remarkably accurate.', difficulty: 'medium', domainIds: ['science'], relatedEntityId: 'mendeleev-periodic-table', relatedEntityType: 'event' },
  { id: 't-14', question: 'Which Chinese explorer commanded a fleet of 300 ships decades before Columbus\'s three?', options: ['Kublai Khan', 'Zheng He', 'Marco Polo', 'Sun Tzu'], correctIndex: 1, explanation: 'Admiral Zheng He commanded enormous treasure fleets (up to 300 ships and 27,000 crew) across the Indian Ocean from 1405-1433 — decades before Columbus\'s three small ships crossed the Atlantic.', difficulty: 'easy', domainIds: ['exploration'], relatedEntityId: 'zheng-he', relatedEntityType: 'person' },
  { id: 't-15', question: 'Darwin delayed publishing On the Origin of Species for about 20 years. What finally forced his hand?', options: ['His publisher threatened to cancel the contract', 'Alfred Russel Wallace independently arrived at the same theory', 'The Church offered to endorse his work', 'His health was failing and he feared dying before publishing'], correctIndex: 1, explanation: 'In 1858, Darwin received a letter from Alfred Russel Wallace describing an almost identical theory of natural selection. This forced a joint presentation at the Linnean Society and Darwin\'s rush to publish Origin in 1859.', difficulty: 'hard', domainIds: ['science'], relatedEntityId: 'origin-of-species-published', relatedEntityType: 'event' },

  // Ancient World
  { id: 't-16', question: 'What was Marcus Aurelius famous for writing while on military campaigns?', options: ['Letters to the Roman Senate', 'A book of personal philosophy called Meditations', 'Military strategy manuals', 'Histories of the Roman Republic'], correctIndex: 1, explanation: 'Marcus Aurelius wrote his Meditations — a series of personal reflections on Stoic philosophy — while commanding Roman legions on the Danube frontier. He never intended them for publication.', difficulty: 'easy', domainIds: ['philosophy'], relatedEntityId: 'per-aw-marcus-aurelius', relatedEntityType: 'person' },
  { id: 't-17', question: 'How did Alexander the Great deal with the Gordian Knot?', options: ['He spent three days untying it', 'He cut it with his sword', 'He had his engineers disassemble it', 'He declared it a myth and walked away'], correctIndex: 1, explanation: 'Legend says the Gordian Knot was an impossibly complex knot that whoever untied would rule Asia. Alexander simply drew his sword and slashed through it — solving the unsolvable through bold, unconventional thinking.', difficulty: 'easy', domainIds: ['war'], relatedEntityId: 'per-aw-alexander', relatedEntityType: 'person' },
  { id: 't-18', question: 'What architectural innovation allowed Rome to build the Colosseum and aqueducts?', options: ['Steel reinforcement', 'Roman concrete (opus caementicium)', 'Egyptian construction techniques', 'Greek marble-cutting methods'], correctIndex: 1, explanation: 'Roman concrete was a revolutionary building material made from volcanic ash (pozzolana), lime, and seawater. It was stronger than modern Portland cement and could even set underwater — enabling aqueducts, harbors, and the Pantheon dome.', difficulty: 'medium', domainIds: ['technology'], relatedEntityId: 'evt-aw-invention-roman-concrete', relatedEntityType: 'event' },
  { id: 't-19', question: 'What did Hannibal famously bring across the Alps to invade Rome?', options: ['A fleet of ships on wheels', 'War elephants', 'Siege towers', 'Greek fire'], correctIndex: 1, explanation: 'Hannibal crossed the Alps in 218 BCE with approximately 37 war elephants, along with 50,000 infantry and 9,000 cavalry. Most elephants died during the crossing, but the feat remains one of military history\'s most audacious maneuvers.', difficulty: 'easy', domainIds: ['war'], relatedEntityId: 'evt-aw-hannibal-crosses-alps', relatedEntityType: 'event' },
  { id: 't-20', question: 'How did Eratosthenes calculate the circumference of the Earth in 240 BCE?', options: ['He sailed around Africa', 'He measured shadows in two different cities at the same time', 'He used the stars to triangulate', 'He estimated based on the size of the Moon'], correctIndex: 1, explanation: 'Eratosthenes noticed that at noon on the summer solstice, the sun cast no shadow in Syene but cast a shadow at a 7.2-degree angle in Alexandria. Using the distance between the cities and simple geometry, he calculated Earth\'s circumference to within about 2% of the actual value.', difficulty: 'hard', domainIds: ['science'], relatedEntityId: 'per-aw-eratosthenes', relatedEntityType: 'person' },

  // Medieval World
  { id: 't-21', question: 'How large was Genghis Khan\'s empire at its peak?', options: ['Roughly the size of modern Europe', 'About 12 million square miles — the largest contiguous land empire ever', 'About the size of the Roman Empire', 'Approximately 3 million square miles'], correctIndex: 1, explanation: 'The Mongol Empire at its peak covered roughly 12 million square miles — about 22% of the Earth\'s total land area. It stretched from Korea to Hungary and was the largest contiguous land empire in human history.', difficulty: 'medium', domainIds: ['war', 'politics'], relatedEntityId: 'per-genghis-khan', relatedEntityType: 'person' },
  { id: 't-22', question: 'Who was Mansa Musa, and why is he remembered?', options: ['A Mongol general who sacked Baghdad', 'The richest person who ever lived, emperor of Mali', 'The founder of Timbuktu\'s university', 'A Crusader king who captured Jerusalem'], correctIndex: 1, explanation: 'Mansa Musa, emperor of the Mali Empire, is often cited as the richest person in history. His 1324 pilgrimage to Mecca was so extravagant — he distributed so much gold in Cairo — that he crashed the Egyptian economy for a decade.', difficulty: 'medium', domainIds: ['economics', 'politics'], relatedEntityId: 'per-mansa-musa', relatedEntityType: 'person' },
  { id: 't-23', question: 'What was the House of Wisdom in Baghdad?', options: ['A royal palace for the Abbasid caliphs', 'A center for translation, scholarship, and scientific research', 'A mosque built during the Golden Age of Islam', 'A secret society of Islamic mystics'], correctIndex: 1, explanation: 'The House of Wisdom (Bayt al-Hikma) was a major intellectual center during the Islamic Golden Age. Scholars there translated Greek, Persian, and Indian texts into Arabic, and made groundbreaking advances in algebra, astronomy, medicine, and optics.', difficulty: 'medium', domainIds: ['science', 'philosophy'], relatedEntityId: 'evt-house-of-wisdom', relatedEntityType: 'event' },
  { id: 't-24', question: 'Why did the Mongols destroy Baghdad in 1258?', options: ['The caliph refused to surrender and insulted the Mongol envoys', 'Baghdad had attacked Mongol trade caravans', 'A religious dispute between the Mongols and Islam', 'Baghdad was strategically unimportant — it was accidental'], correctIndex: 0, explanation: 'The Abbasid Caliph Al-Musta\'sim refused to submit to Mongol demands and reportedly executed Mongol envoys. Hulagu Khan besieged the city, sacked it, and destroyed the House of Wisdom. The Tigris supposedly ran black with ink from the destroyed libraries.', difficulty: 'hard', domainIds: ['war'], relatedEntityId: 'evt-mongol-sack-baghdad', relatedEntityType: 'event' },
  { id: 't-25', question: 'What did the Magna Carta (1215) actually do?', options: ['Gave voting rights to all English citizens', 'Established that the king was subject to the law', 'Abolished feudalism in England', 'Created the first democratic parliament'], correctIndex: 1, explanation: 'The Magna Carta was not about democracy — it was a deal between King John and rebellious barons. But its revolutionary principle was that even the king was not above the law, laying the philosophical groundwork for constitutional government centuries later.', difficulty: 'medium', domainIds: ['politics'], relatedEntityId: 'evt-magna-carta', relatedEntityType: 'event' },

  // Modern Era
  { id: 't-26', question: 'What was George Washington\'s most important decision as president?', options: ['Leading the Continental Army', 'Signing the Constitution', 'Voluntarily stepping down after two terms', 'Appointing Alexander Hamilton as Treasury Secretary'], correctIndex: 2, explanation: 'By voluntarily leaving office after two terms, Washington established the precedent that American presidents are not kings. King George III reportedly said it made Washington "the greatest man in the world." The precedent held until FDR and was later codified in the 22nd Amendment.', difficulty: 'medium', domainIds: ['politics'], relatedEntityId: 'per-washington', relatedEntityType: 'person' },
  { id: 't-27', question: 'How many people died during the French Revolution\'s Reign of Terror?', options: ['A few hundred political leaders', 'About 17,000 by guillotine, with up to 40,000 total', 'Over 500,000', 'About 2,000'], correctIndex: 1, explanation: 'During the Reign of Terror (1793-1794), about 17,000 people were officially executed by guillotine, though estimates of total deaths including prison and summary executions reach around 40,000. Robespierre, who orchestrated much of the Terror, was himself guillotined.', difficulty: 'hard', domainIds: ['politics'], relatedEntityId: 'evt-reign-of-terror', relatedEntityType: 'event' },
  { id: 't-28', question: 'What did Napoleon\'s Civil Code accomplish that outlasted his empire?', options: ['It established military conscription across Europe', 'It created a uniform legal system based on merit, not birth', 'It banned slavery throughout French territories', 'It established universal education'], correctIndex: 1, explanation: 'The Napoleonic Code (1804) replaced the patchwork of feudal laws with a clear, written legal system. It established equality before the law, property rights, and secular authority over civil matters. It still forms the basis of legal systems in over 70 countries today.', difficulty: 'hard', domainIds: ['politics'], relatedEntityId: 'evt-napoleonic-code', relatedEntityType: 'event' },

  // 20th Century
  { id: 't-29', question: 'What event triggered the start of World War I?', options: ['Germany invaded Poland', 'The sinking of the Lusitania', 'The assassination of Archduke Franz Ferdinand', 'The Russian Revolution'], correctIndex: 2, explanation: 'The assassination of Archduke Franz Ferdinand of Austria-Hungary by Gavrilo Princip in Sarajevo on June 28, 1914, set off a chain of alliance obligations that pulled all major European powers into war within weeks.', difficulty: 'easy', domainIds: ['war'], relatedEntityId: 'evt-20c-assassination-franz-ferdinand', relatedEntityType: 'event' },
  { id: 't-30', question: 'How close did the Cuban Missile Crisis come to nuclear war?', options: ['Not very — both sides were bluffing', 'A Soviet submarine officer refused to authorize a nuclear torpedo launch', 'The missiles were never armed', 'It was resolved diplomatically before any real danger'], correctIndex: 1, explanation: 'During the crisis, Soviet submarine officer Vasili Arkhipov refused to authorize a nuclear torpedo strike against US Navy ships, even though two of the three required officers had approved. His single dissent may have prevented nuclear war.', difficulty: 'hard', domainIds: ['war', 'politics'], relatedEntityId: 'evt-20c-cuban-missile-crisis', relatedEntityType: 'event' },
  { id: 't-31', question: 'What was the significance of the fall of the Berlin Wall in 1989?', options: ['It ended World War II', 'It symbolized the end of the Cold War and led to German reunification', 'It was a planned demolition by the East German government', 'It started the European Union'], correctIndex: 1, explanation: 'The fall of the Berlin Wall on November 9, 1989, was the most powerful symbol of the Cold War\'s end. Triggered by a confused press conference, thousands of East Berliners rushed the checkpoints. Germany reunified less than a year later, and the Soviet Union collapsed in 1991.', difficulty: 'easy', domainIds: ['politics'], relatedEntityId: 'evt-20c-fall-berlin-wall', relatedEntityType: 'event' },
  { id: 't-32', question: 'What did Alan Turing do during World War II?', options: ['Led the D-Day invasion planning', 'Broke the German Enigma code at Bletchley Park', 'Developed radar technology', 'Designed the atomic bomb'], correctIndex: 1, explanation: 'Turing led the team at Bletchley Park that cracked the Enigma cipher, giving the Allies access to German military communications. Historians estimate this shortened the war by at least two years and saved millions of lives.', difficulty: 'easy', domainIds: ['technology', 'war'], relatedEntityId: 'per-20c-turing', relatedEntityType: 'person' },
  { id: 't-33', question: 'What was Gandhi\'s Salt March and why did it matter?', options: ['A protest against British salt taxes that became a symbol of nonviolent resistance', 'A military march to capture British salt mines', 'A religious pilgrimage to the Indian Ocean', 'A trade negotiation between India and Britain'], correctIndex: 0, explanation: 'In 1930, Gandhi led a 240-mile march to the sea to make his own salt, defying the British salt tax. The simple, symbolic act galvanized millions of Indians and drew worldwide attention to the independence movement, demonstrating the power of nonviolent civil disobedience.', difficulty: 'medium', domainIds: ['politics'], relatedEntityId: 'evt-20c-gandhi-salt-march', relatedEntityType: 'event' },
  { id: 't-34', question: 'What percentage of the world\'s population did WWII kill?', options: ['About 1%', 'About 3% — roughly 70-85 million people', 'About 10%', 'About 0.5%'], correctIndex: 1, explanation: 'World War II killed an estimated 70-85 million people, or about 3% of the world\'s 1940 population of 2.3 billion. This makes it the deadliest conflict in human history, with the majority of deaths being civilians.', difficulty: 'medium', domainIds: ['war'], relatedEntityId: 'evt-20c-wwii-outbreak', relatedEntityType: 'event' },
  { id: 't-35', question: 'How did Nelson Mandela spend 27 years in prison and emerge without bitterness?', options: ['He was treated well by the guards', 'He studied law and Stoic philosophy, and chose reconciliation over revenge', 'He had secret communications with the outside world', 'He converted to a new religion that preached forgiveness'], correctIndex: 1, explanation: 'Mandela studied extensively in prison, including Afrikaans (the language of his oppressors) and Marcus Aurelius\'s Meditations. He emerged committed to reconciliation, not revenge, and established the Truth and Reconciliation Commission rather than pursuing retribution.', difficulty: 'medium', domainIds: ['politics', 'philosophy'], relatedEntityId: 'per-20c-mandela', relatedEntityType: 'person' },
];

// ── Exploration Paths ──────────────────────────────────────────────────────

export const PATHS: ExplorationPath[] = [
  {
    id: 'path-medici-effect',
    title: 'The Medici Effect',
    subtitle: 'How one family funded a revolution in human thought',
    description: 'Follow the thread from Medici banking wealth through the patronage of Brunelleschi, Botticelli, Leonardo, and Michelangelo. See how money, taste, and power combined to create the greatest cultural flowering in history.',
    color: '#E74C3C', icon: '\u{1F3DB}\u{FE0F}',
    entityIds: ['cosimo-de-medici', 'platonic-academy-founded', 'brunelleschi-dome', 'botticelli-birth-of-venus', 'lorenzo-de-medici', 'pazzi-conspiracy', 'leonardo-da-vinci', 'michelangelo-buonarroti'],
    entityTypes: ['person', 'event', 'event', 'event', 'person', 'event', 'person', 'person'],
    estimatedMinutes: 25, difficulty: 'beginner',
  },
  {
    id: 'path-chain-of-revolutions',
    title: 'The Chain of Revolutions',
    subtitle: 'How one scientific upheaval leads to the next',
    description: 'Trace the intellectual chain from Copernicus questioning the heavens, to Galileo confirming it, to Newton explaining it, to Einstein rewriting the rules entirely. Each revolution builds on the last.',
    color: '#3498DB', icon: '\u{1F52D}',
    entityIds: ['copernicus-de-revolutionibus', 'galileo-telescope-observations', 'galileo-trial', 'principia-published', 'einstein-special-relativity', 'einstein-general-relativity'],
    entityTypes: ['event', 'event', 'event', 'event', 'event', 'event'],
    estimatedMinutes: 30, difficulty: 'intermediate',
  },
  {
    id: 'path-alchemy-to-cern',
    title: 'From Alchemy to CERN',
    subtitle: 'The 2,500-year quest to understand what everything is made of',
    description: 'Begin with the ancient Greeks arguing about atoms, journey through medieval alchemy\'s failures, watch chemistry emerge from the ashes, discover the atom has an interior, and end at the Large Hadron Collider.',
    color: '#9B59B6', icon: '\u{2697}\u{FE0F}',
    entityIds: ['democritus-atomism', 'lavoisier-oxygen', 'dalton-atomic-theory', 'mendeleev-periodic-table', 'thomson-electron', 'rutherford-nucleus', 'heisenberg-uncertainty-principle', 'higgs-boson-discovery'],
    entityTypes: ['event', 'event', 'event', 'event', 'event', 'event', 'event', 'event'],
    estimatedMinutes: 35, difficulty: 'intermediate',
  },
  {
    id: 'path-women-erased',
    title: 'Women Who Were Erased',
    subtitle: 'Brilliant minds whose contributions were overlooked or stolen',
    description: 'From Rosalind Franklin\'s stolen X-ray to Marie Curie\'s Nobel scandal, explore the stories of women who made revolutionary scientific contributions and were denied recognition in their time.',
    color: '#E91E63', icon: '\u{2728}',
    entityIds: ['marie-curie', 'curie-discovers-radium', 'curie-second-nobel', 'rosalind-franklin', 'dna-structure-discovered'],
    entityTypes: ['person', 'event', 'event', 'person', 'event'],
    estimatedMinutes: 20, difficulty: 'beginner',
  },
  {
    id: 'path-navigation-to-moon',
    title: 'From Compass to Moon Landing',
    subtitle: 'How humanity learned to navigate — and left the planet',
    description: 'Follow the thread from Chinese compass invention through Portuguese navigation, Columbus\'s gamble, the chronometer, Sputnik, and Apollo 11. The story of humans finding their way.',
    color: '#2ECC71', icon: '\u{1F680}',
    entityIds: ['compass-china', 'portuguese-exploration-begins', 'columbus-first-voyage', 'magellan-circumnavigation', 'sputnik-launch', 'apollo-11-moon-landing'],
    entityTypes: ['event', 'event', 'event', 'event', 'event', 'event'],
    estimatedMinutes: 25, difficulty: 'beginner',
  },
  {
    id: 'path-tree-of-life',
    title: 'The Tree of Life',
    subtitle: 'How we learned where life comes from',
    description: 'From Aristotle\'s classification of animals to Darwin\'s revolutionary insight to the cracking of the genetic code and CRISPR. The story of biology is the story of understanding ourselves.',
    color: '#27AE60', icon: '\u{1F333}',
    entityIds: ['aristotle-biology', 'linnaeus-systema-naturae', 'darwin-beagle-voyage', 'origin-of-species-published', 'mendel-genetics', 'dna-structure-discovered', 'human-genome-completed', 'crispr-gene-editing'],
    entityTypes: ['event', 'event', 'event', 'event', 'event', 'event', 'event', 'event'],
    estimatedMinutes: 30, difficulty: 'intermediate',
  },
  {
    id: 'path-rise-fall-rome',
    title: 'The Rise and Fall of Rome',
    subtitle: 'From a city of seven hills to the collapse of an empire',
    description: 'Trace Roman history from the founding of the Republic through Caesar\'s crossing of the Rubicon, the glory of Pax Romana under Augustus, Marcus Aurelius\'s philosophical reign, and the final sack by barbarians. The eternal question: why do empires fall?',
    color: '#C0392B', icon: '\u{1F3DB}\u{FE0F}',
    entityIds: ['evt-aw-roman-republic-est', 'evt-aw-punic-wars-begin', 'evt-aw-hannibal-crosses-alps', 'evt-aw-destruction-carthage', 'evt-aw-crossing-rubicon', 'evt-aw-assassination-caesar', 'per-aw-augustus', 'evt-aw-pax-romana', 'evt-aw-construction-colosseum', 'per-aw-marcus-aurelius', 'evt-aw-edict-milan', 'evt-aw-sack-rome-alaric', 'evt-aw-fall-western-rome'],
    entityTypes: ['event', 'event', 'event', 'event', 'event', 'event', 'person', 'event', 'event', 'person', 'event', 'event', 'event'],
    estimatedMinutes: 35, difficulty: 'intermediate',
  },
  {
    id: 'path-conquerors',
    title: 'Conquerors',
    subtitle: 'Alexander, Genghis Khan, Napoleon — the men who redrew the map',
    description: 'Compare the strategies, motivations, and legacies of history\'s greatest conquerors. Alexander spread Greek culture to Persia, Genghis Khan built the largest land empire ever, and Napoleon reshaped European law. What drove them, and what did their conquests leave behind?',
    color: '#E67E22', icon: '\u{2694}\u{FE0F}',
    entityIds: ['per-aw-alexander', 'evt-aw-alexanders-conquests', 'evt-aw-battle-gaugamela', 'per-genghis-khan', 'evt-mongol-empire-founded', 'evt-mongol-sack-baghdad', 'per-napoleon', 'evt-battle-austerlitz', 'evt-battle-waterloo'],
    entityTypes: ['person', 'event', 'event', 'person', 'event', 'event', 'person', 'event', 'event'],
    estimatedMinutes: 30, difficulty: 'intermediate',
  },
  {
    id: 'path-revolution',
    title: 'Revolution!',
    subtitle: 'How ordinary people toppled kings, emperors, and tsars',
    description: 'The American colonists threw off a king. The French stormed the Bastille. The Russians overthrew the Tsar. The Chinese transformed their civilization. Each revolution inspired the next — and each revealed the terrible costs of upheaval alongside the promise of freedom.',
    color: '#E74C3C', icon: '\u{1F525}',
    entityIds: ['evt-declaration-independence', 'per-washington', 'evt-storming-bastille', 'evt-reign-of-terror', 'per-napoleon', 'evt-20c-russian-revolution', 'per-20c-lenin', 'evt-20c-chinese-revolution-1911', 'per-20c-mao'],
    entityTypes: ['event', 'person', 'event', 'event', 'person', 'event', 'person', 'event', 'person'],
    estimatedMinutes: 30, difficulty: 'intermediate',
  },
  {
    id: 'path-world-at-war',
    title: 'The World at War',
    subtitle: 'From the assassination in Sarajevo to the fall of the Berlin Wall',
    description: 'Follow the devastating chain from World War I through the rise of totalitarianism, World War II, the atomic bomb, and the Cold War. Understand how the "war to end all wars" led to an even greater one, and how the shadow of nuclear annihilation shaped the modern world.',
    color: '#7F8C8D', icon: '\u{1F4A5}',
    entityIds: ['evt-20c-assassination-franz-ferdinand', 'evt-20c-wwi-outbreak', 'evt-20c-treaty-versailles', 'evt-20c-hitler-rise', 'evt-20c-wwii-outbreak', 'evt-20c-holocaust', 'evt-20c-d-day', 'evt-20c-hiroshima', 'evt-20c-cold-war-begins', 'evt-20c-cuban-missile-crisis', 'evt-20c-fall-berlin-wall', 'evt-20c-soviet-collapse'],
    entityTypes: ['event', 'event', 'event', 'event', 'event', 'event', 'event', 'event', 'event', 'event', 'event', 'event'],
    estimatedMinutes: 40, difficulty: 'advanced',
  },
  {
    id: 'path-freedom-fighters',
    title: 'Freedom Fighters',
    subtitle: 'From Spartacus to Mandela — the long arc of liberation',
    description: 'Trace the thread of resistance from ancient slave revolts through the abolition movement, the struggle for Indian independence, the American civil rights movement, and the end of apartheid. Each generation\'s fight for freedom built on the courage of those who came before.',
    color: '#F39C12', icon: '\u{270A}',
    entityIds: ['per-aw-epictetus', 'per-toussaint', 'evt-haitian-revolution', 'per-douglass', 'evt-emancipation-proclamation', 'per-20c-gandhi', 'evt-20c-gandhi-salt-march', 'evt-20c-indian-independence', 'per-20c-mlk', 'evt-20c-march-washington', 'evt-20c-civil-rights-act', 'per-20c-mandela', 'evt-20c-apartheid-end'],
    entityTypes: ['person', 'person', 'event', 'person', 'event', 'person', 'event', 'event', 'person', 'event', 'event', 'person', 'event'],
    estimatedMinutes: 35, difficulty: 'intermediate',
  },
  {
    id: 'path-silk-road-ideas',
    title: 'The Silk Road of Ideas',
    subtitle: 'How knowledge traveled from East to West and back again',
    description: 'Follow the transmission of ideas across civilizations: Chinese invention of paper and compass, Indian mathematics traveling to Baghdad, Islamic scholars preserving Greek philosophy, and the knowledge explosion that ignited the Renaissance. Ideas have no borders.',
    color: '#16A085', icon: '\u{1F4DC}',
    entityIds: ['evt-aw-silk-road-opens', 'evt-aw-confucius-teachings', 'evt-aw-buddha-enlightenment', 'per-aw-euclid', 'evt-house-of-wisdom', 'per-al-khwarizmi', 'per-ibn-sina', 'per-ibn-al-haytham', 'evt-marco-polo-travels', 'evt-fall-constantinople', 'evt-gutenberg-press'],
    entityTypes: ['event', 'event', 'event', 'person', 'event', 'person', 'person', 'person', 'event', 'event', 'event'],
    estimatedMinutes: 30, difficulty: 'intermediate',
  },
];

// ── Explorer Archetypes ──────────────────────────────────────────────────────

export const ARCHETYPES: ExplorerArchetype[] = [
  { id: 'strategist', name: 'The War Room Strategist', icon: '\u{2694}\u{FE0F}', description: 'You\'re drawn to power, conflict, and the chess game of nations. You want to understand why empires rise and fall, how battles are won, and what makes a great leader.', primaryDomains: ['war', 'politics'], favoriteEras: ['age-of-exploration', 'renaissance'], pathIds: ['path-chain-of-revolutions'] },
  { id: 'inventor', name: 'The Inventor', icon: '\u{1F4A1}', description: 'You love the eureka moment — when someone figures out how to do something nobody thought possible. Telescopes, printing presses, DNA editing — you want to understand the technology that changed the world.', primaryDomains: ['technology', 'science'], favoriteEras: ['scientific-revolution', 'elements-matter'], pathIds: ['path-alchemy-to-cern'] },
  { id: 'artist', name: 'The Studio Apprentice', icon: '\u{1F3A8}', description: 'Beauty and expression move you. You want to stand in Leonardo\'s workshop, debate Michelangelo about sculpture, and understand how art both reflects and shapes civilization.', primaryDomains: ['art', 'philosophy'], favoriteEras: ['renaissance'], pathIds: ['path-medici-effect'] },
  { id: 'explorer', name: 'The Navigator', icon: '\u{1F30D}', description: 'You want to sail into the unknown. From Polynesian wayfinders to the Apollo astronauts, you\'re fascinated by the courage it takes to venture beyond the edge of the map.', primaryDomains: ['exploration'], favoriteEras: ['age-of-exploration', 'stars-cosmos'], pathIds: ['path-navigation-to-moon'] },
  { id: 'philosopher', name: 'The Deep Thinker', icon: '\u{1F4AD}', description: 'You ask the big questions. What is consciousness? What is truth? How should we live? You want to sit with Socrates, argue with Machiavelli, and understand the ideas that shaped civilization.', primaryDomains: ['philosophy', 'religion'], favoriteEras: ['renaissance', 'scientific-revolution'], pathIds: ['path-chain-of-revolutions'] },
  { id: 'scientist', name: 'The Lab Rat', icon: '\u{1F52C}', description: 'You want data, experiments, and proof. From Galileo\'s telescope to CERN\'s particle collider, you\'re fascinated by the process of discovery — the hypothesis, the test, the breakthrough.', primaryDomains: ['science', 'medicine'], favoriteEras: ['scientific-revolution', 'life-evolution', 'elements-matter'], pathIds: ['path-alchemy-to-cern', 'path-tree-of-life'] },
];

// ── Helpers ──────────────────────────────────────────────────────────────

export function getDailyBattle(dayOffset = 0): HistoricalBattle {
  const dayIndex = Math.floor(Date.now() / 86400000) + dayOffset;
  return BATTLES[dayIndex % BATTLES.length];
}

export function getDailyTrivia(dayOffset = 0): TriviaQuestion {
  const dayIndex = Math.floor(Date.now() / 86400000) + dayOffset;
  return TRIVIA[dayIndex % TRIVIA.length];
}
