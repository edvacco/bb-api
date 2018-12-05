import fetch from 'node-fetch';
import querystring from 'querystring';
import LoginCookie from '../loginCookie';
import { BASE_ENDPOINT, DEFAULT_HEADERS } from '../constants';

function stringToAmount(string) {
  return (
    -1 *
    parseFloat(
      string
        .replace('R$ ', '')
        .replace('.', '')
        .replace(',', '.'),
    )
  );
}

function stringToDate(string) {
  const parts = string.split('/');
  const day = parts[0];
  const month = parts[1];
  let year = parts[2];

  if (year.length === 2) {
    year = `20${year}`;
  }

  return new Date(year, month, day);
}

function stringToDateInstallment(string, month) {
  const parts = string.split('/');
  const day = parts[0];
  const year = `20${parts[2]}`;

  return new Date(year, parseInt(month, 10) - 1, day);
}

export default class BBCardBill {
  constructor({ cardAccountNumber, billId, billDate }) {
    this.cardAccountNumber = cardAccountNumber;
    this.billId = billId;
    this.billDate = billDate;
  }

  async getTransactions() {
    const transactionsUrl = 'tela/ExtratoFatura/extrato';

    const params = {
      numeroContaCartao: this.cardAccountNumber,
      sequencialFatura: this.billId,
      dataFatura: this.billDate,
      tipoExtrato: 'F',
    };

    const response = await fetch(`${BASE_ENDPOINT}${transactionsUrl}`, {
      headers: {
        ...DEFAULT_HEADERS,
        cookie: LoginCookie.getGlobal(),
      },
      method: 'POST',
      body: querystring.stringify(params),
    });

    const text = await response.text();
    const json = JSON.parse(text);

    return json.conteiner.telas[0].sessoes
      .map(s => {
        if (s.cabecalho === 'Lançamentos em processamento') {
          return {
            processing: s.celulas.map(c => ({
              date: stringToDate(c.componentes[0].componentes[0].texto),
              description: c.componentes[1].componentes[0].texto,
              amount: stringToAmount(c.componentes[2].componentes[0].texto),
            })),
          };
        }

        if (s.cabecalho === '    Pagamentos') {
          return {
            payment: s.celulas.slice(1).map(c => ({
              date: stringToDate(c.componentes[0].componentes[0].texto),
              description: c.componentes[1].componentes[0].texto,
              amount: stringToAmount(c.componentes[2].componentes[0].texto),
            })),
          };
        }

        if (s.cabecalho === '    Compras a vista') {
          return {
            atSight: s.celulas.slice(1).map(c => ({
              date: stringToDate(c.componentes[0].componentes[0].texto),
              description: c.componentes[1].componentes[0].texto,
              amount: stringToAmount(c.componentes[2].componentes[0].texto),
            })),
          };
        }

        if (s.cabecalho === '    Compras/Pgto Contas Parc') {
          return {
            inInstallments: s.celulas.slice(2).map(c => ({
              date: stringToDateInstallment(
                c.componentes[0].componentes[0].texto,
                this.billDate.slice(2, 4),
              ),
              description: c.componentes[1].componentes[0].texto,
              amount: stringToAmount(c.componentes[2].componentes[0].texto),
            })),
          };
        }

        return {};
      })
      .reduce((acc, p) => ({ ...acc, ...p }), {});
  }

  // return json.conteiner.telas[0].sessoes[0].celulas
  //   .map(c => c.protocolo.parametros.filter(p => p[0] === 'dataFatura'))
  //   .map(p => p[0][1]);
}