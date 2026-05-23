// Fausses réponses pour développer hors réseau ou sans configurer le proxy.
// Activable par les composants qui veulent travailler en isolation :
//
//   import { mockApi } from './services/mock.js';
//   mockApi.getHealth().then(console.log);
//
// À étoffer au fur et à mesure que les composants l'exigent.

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockApi = {
  async getHealth() {
    await wait(50);
    return {
      status: 'ok',
      database: 'ok',
      timestamp: new Date().toISOString(),
    };
  },

  async getReferentielDisciplinaire() {
    await wait(50);
    return {
      domaines: [
        { code: 'DEG', libelle: 'Droit, économie, gestion' },
        { code: 'LLA', libelle: 'Lettres, langues, arts' },
      ],
      disciplines: [
        { code: '01', libelle: 'Droit' },
        { code: '02', libelle: 'Sciences économiques' },
      ],
      secteurs: [
        { code: 'Droit', libelle: 'Droit' },
        { code: 'Sciences économiques', libelle: 'Sciences économiques' },
      ],
      mentions: [
        { code: '2500164', libelle: 'Informatique', secteur: 'Informatique' },
        { code: '2500200', libelle: 'Droit', secteur: 'Droit' },
      ],
    };
  },
};
