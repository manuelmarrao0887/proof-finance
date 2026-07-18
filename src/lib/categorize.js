/* ════════════════════════════════════════════════════════════════════════
   categorize — palpite de categoria a partir da descrição de um movimento
   bancário. Mapeia comerciantes conhecidos (extratos ActivoBank/PT) para as
   categorias existentes (ids do bdg). Usado no importador como fallback quando
   as regras do utilizador (applyRules) não classificam.

   Devolve um id de categoria (rest, sup, …) ou null se não houver palpite.
   NÃO deteta transferências (isso é do importBank.isTransferDesc).

   Ordem importa: a primeira regra que casa ganha (mais específica primeiro).
   ════════════════════════════════════════════════════════════════════════ */

// Normaliza: minúsculas, sem acentos, espaços colapsados.
function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// [id, [palavras-chave]] — ordem do array = prioridade.
const RULES = [
  // Casa
  ['cas', ['trf p/ bankinter', 'condominio', 'condomínio', 'prestacao casa']],
  // Empregada / apoio doméstico
  ['emp', ['ana gregorio']],
  // Seguros (inclui saúde por subsistema) + segurança social
  ['seg', ['mgen', 'medis', 'seguranca social', 'fidelidade', 'seguro', 'tranquilidade', 'ageas']],
  // Saúde
  ['sau', ['hospital', 'hosp luz', 'hosp ', 'clinica', 'clínica', 'farmacia', 'farmácia', 'well s', 'wells', 'optica', 'ótica', 'optica universitaria', 'dentaria', 'dentária', 'analises', 'análises']],
  // Animais
  ['ani', ['barkibu', 'kiwoko', 'masquepet', 'veterinar', 'petshop', 'pet shop', 'zooplus']],
  // Telecom
  ['tel', ['vodafone', 'meo', 'nos ', 'nowo', 'transatel', 'ubigi', 'digi ']],
  // Ginásio
  ['gym', ['vivagym', 'fitness hut', 'holmes place', 'studio bongard', 'bongard', 'ginasio', 'ginásio', 'gym']],
  // Combustível
  ['cmb', ['est servico', 'estacao servico', 'combu', 'repsol', 'galp', 'bp ', 'cepsa', 'prio', 'a.s.oeiras', 'pulsacao veloz', 'gasolina', 'e016 portimao']],
  // Carro (manutenção, peças, tracking, parques, portagens)
  ['car', ['cartrack', 'norauto', 'feu vert', 'midas', 'autodoc', 'bmw', 'audi', 'mercedes', 'peugeot', 'renault', 'citroen', 'parque', 'parques tejo', 'via verde', 'brisa', 'portagem', 'estacionamento', 'ipark', 'empark']],
  // Negócio (ferramentas/serviços profissionais)
  ['neg', ['vercel', 'nabu casa', 'nabucasa', 'google workspace', 'google ads', 'monday.com', 'genspark', 'printpal', 'ptisp', 'hipay', 'eupago', 'aws', 'openai', 'anthropic', 'github', 'stripe', 'namecheap', 'cloudflare']],
  // Subscrições (media/software pessoal)
  ['sub', ['apple.com bill', 'itunes', 'google one', 'google google one', 'netflix', 'spotify', 'youtube premium', 'hbo', 'disney', 'amazon prime', 'icloud', 'dropbox', 'microsoft 365', 'playstation', 'xbox']],
  // Supermercado
  ['sup', ['continente', 'contin bom dia', 'pingo doce', 'auchan', 'recheio', 'coviran', 'covirán', 'sacolinha', 'minipreco', 'minipreço', 'lidl', 'aldi', 'mercadona', 'intermarche', 'el corte ingles', 'jumbo']],
  // Lazer
  ['laz', ['festival', 'krazy world', 'aventura', 'campo pequeno', 'plaj', 'supreme sports', 'minutos de leitura', 'narrativalegre', 'a narrativa', 'narrativa', 'jockey', 'hipodromo', 'jumpyard', 'dejavu park', 'hotsummer', 'charming perspective', 'sporting clube', 'nyx arraial', 'cinema', 'nos cinemas', 'fnac', 'bilhet', 'teatro', 'museu', 'zoo', 'oceanario']],
  // Restauração (restaurantes, cafés, snacks, fast food, padarias, vending)
  ['rest', [
    'mcdonald', 'mc donald', 'uber eats', 'glovo', 'bolt food', 'h3', 'snak bar', 'snack bar',
    'restaurante', 'adega', 'taberna', 'pinseria', 'pizaria', 'pizzaria', 'starbucks', 'cafe',
    'café', 'pastelaria', 'padaria', 'gleba', 'burg hamb', 'burger', 'o tradicional', 'pare e prove',
    'ancora terrace', 'augusto lisboa', 'sabores', 'dgusta', 'casa da sandes', 'leblon', 'samurai',
    'koala bar', 'pancrisp', 'balcao torres vedras', 'neovending', 'cafe do ponto', 'n espaco damaia',
    'ikea food', 'ikea foo', 'imperio', 'bomfonte', 'kfc', 'telepizza', 'vitaminas', 'kanto',
    'pad port', 'padaria', 'a chamine', 'vale do lino', 'casa sandes', 'casa das sandes',
    'o as do pao', 'le caffe', 'galeria de nata', 'alvarinho', 'artfood', 'peneiras', 'mel e canela',
    'churrasqueira', 'refugio notas', 'manteigaria', 'trigo aldeia', 'o barracao', 'moinhos d outono',
    'browers', 'rocketbar', 'portugalia', 'quiosque', 'sogenave', 'delta 7370', 'res caf',
    'benjamin carnaxide', ' bk', 'burger king', 'r.c.sanches', 'sanches ii', 'bolt',
  ]],
  // Compras (mobiliário, desporto, roupa, eletrónica, casa)
  ['comp', ['ikea', 'decathlon', 'zippy', 'primark', 'jysk', 'leroy merlin', 'leroymerlin', 'bricolage', 'staples', 'iservices', 'rituals', 'prozis', 'casa inglesa', 'worten', 'mediamarkt', 'aki', 'maxmat', 'sport zone', 'nike', 'adidas', 'h&m', 'zara', 'bershka', 'pull', 'kidstore']],
  // Encargos bancários
  ['out', ['custo de servico internacional', 'imposto do selo', 'comissao', 'comissão', 'juros']],
];

export function guessCategory(desc) {
  const d = norm(desc);
  if (!d) return null;
  for (const [id, kws] of RULES) {
    for (const kw of kws) {
      if (d.includes(kw)) return id;
    }
  }
  return null;
}
