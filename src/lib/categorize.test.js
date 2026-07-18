import { describe, it, expect } from 'vitest';
import { guessCategory } from './categorize.js';

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
  ];
  cases.forEach(([desc, exp]) => {
    it(desc + ' → ' + exp, () => expect(guessCategory(desc)).toBe(exp));
  });

  it('descrição desconhecida → null', () => {
    expect(guessCategory('QUALQUER COISA ALEATORIA XYZ')).toBeNull();
    expect(guessCategory('')).toBeNull();
  });
});
