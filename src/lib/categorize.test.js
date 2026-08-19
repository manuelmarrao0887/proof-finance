import { describe, it, expect } from 'vitest';
import { guessCategory, rulePatternFor } from './categorize.js';

describe('guessCategory (palpite por comerciante)', () => {
  const cases = [
    ['COMPRA 4174 CONTINENTE BOM DIA LISB CONTACTLESS', 'sup'],
    ['COMPRA 4174 PINGO DOCE DUQUE', 'sup'],
    ['COMPRA 4174 McDonalds Torres VedrasPT', 'rest'],
    ['COMPRA 4174 UBER EATS PENDING AMSTERDAM', 'rest'],
    ['COMPRA 4174 PAD PORT EXPO NOR LISBO', 'rest'], // padaria portuguesa
    ['DD VODAFONE PORTU', 'tel'],
    ['COMPRA 4174 EST SERVICO REPSOL E1145', 'cmb'],
    ['DD MGEN P0001100069353', 'seg'],
    ['DD VivaGym Portug', 'gym'],
    ['COMPRA 4174 APPLE.COM BILL ITUNES.COM', 'sub'],
    ['COMPRA 4174 VERCEL INC. VERC USD', 'neg'],
    ['DD CARTRACK PORTU', 'car'],
    ['COMPRA 4174 PAGAMENTO BARKIBU SEG.', 'ani'],
    ['COMPRA 4174 HOSPITAL LUZ LISBOA', 'sau'],
    ['COMPRA 4174 COALA FESTIVAL PORT', 'laz'],
    ['TRF P/ Bankinter', 'cas'],
    ['TRF P/ Ana Gregorio', 'emp'],
    ['COMPRA 4174 IKEA ALFRAGIDE CAIXAS E', 'comp'],
    ['COMPRA 4174 DECATHLON AMADORA', 'comp'],
    ['COMPRA 4174 ZIPPY KIDSTORE C COLOMB', 'comp'],
    ['COMPRA 4174 IKEA ALFRAGIDE IKEA FOO', 'rest'], // food court → restauração
    ['COMPRA 4174 FC R.C.SANCHES II LJ2028-TOR', 'rest'],
    ['COMPRA 4174 BOLT.EUD2604221836 Tallinn E', 'rest'], // Bolt Food
    ['COMPRA 4174 E016 Portimao Portimao CONTA', 'cmb'],
    ['COMPRA 4174 BK29413- LAGOA LAGOA PT CONT', 'rest'], // Burger King
    ['COMPRA 4174 BMW Portugal, Lda Porto Salv', 'car'],
    ['COMPRA 4174 MASQUEPET PORTUGAL', 'ani'],
    ['COMPRA 4174 LEROYMERLIN TORRES V', 'comp'],
    ['COMPRA 4174 WELL S LISBOA', 'sau'],
    ['TRF MB WAY P/ JOAO GABRIEL FONSECA DELICADO', 'sau'], // psicólogo
    ['TRF MB WAY P/ CARLA SUSANA OLIVEIRA GARCIA', 'ani'], // creche Pablo
    ['TRF P/ Nuno Catarino', 'ani'],
    ['TRF MB WAY P/ FILIPA MOURAO GONCALVES', 'rest'], // amiga
    ['TRF MB WAY P/ ALBERTO MIGUEL GONCALVES DE SOUSA', 'rest'],
    ['COMPRA 4174 ASSOCIACAO TEMPO DE MUDAR', 'bern'], // escola do Bernardo
  ];
  cases.forEach(([desc, exp]) => {
    it(desc + ' → ' + exp, () => expect(guessCategory(desc)).toBe(exp));
  });

  it('descrição desconhecida → null', () => {
    expect(guessCategory('QUALQUER COISA ALEATORIA XYZ')).toBeNull();
    expect(guessCategory('')).toBeNull();
  });
});

describe('rulePatternFor (aprender regra do import)', () => {
  const cases = [
    ['COMPRA 4174 PINGO DOCE DUQUE D A LI CONTACTLESS', 'pingo doce'],
    ['COMPRA 4174 UBER EATS PENDING AMSTERDAM NL', 'uber eats'],
    ['DD VODAFONE PORTU 07973636083 PT10100825', 'vodafone portu'],
    ['COMPRA 4174 CONTINENTE TO VEDRAS TO CONTACTLESS', 'continente to'],
    ['COMPRA 4174 APPLE.COM BILL ITUNES.COM IE', 'apple.com bill'],
  ];
  cases.forEach(([input, expected]) => {
    it(input.slice(0, 34) + '… → ' + expected, () => expect(rulePatternFor(input)).toBe(expected));
  });
  it('descrição vazia → ""', () => {
    expect(rulePatternFor('')).toBe('');
    expect(rulePatternFor('COMPRA 4174 9999')).toBe('');
  });
  it('MB WAY / TRF para pessoa → padrão é o NOME, nunca "mb way" (senão a regra apanhava todas)', () => {
    expect(rulePatternFor('TRF MB WAY P/ ENG ANA PAULA PINTO PEREIRA')).toBe('eng ana paula');
    expect(rulePatternFor('TRF MB WAY P/ CARLA SUSANA OLIVEIRA GARCIA')).toBe('carla susana oliveira');
    expect(rulePatternFor('TRF P/ Nuno Catarino')).toBe('nuno catarino');
    expect(rulePatternFor('TRF. P/O Manuel Jose Carrilho De Sousa')).toBe('manuel jose carrilho');
    expect(rulePatternFor('TRF MB WAY P/ ANA RITA ALVES PALMA')).not.toBe(rulePatternFor('TRF MB WAY P/ ANA PAULA PINTO'));
  });
});
