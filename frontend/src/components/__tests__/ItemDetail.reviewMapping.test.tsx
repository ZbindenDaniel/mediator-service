import { mapReviewAnswersToInput } from '../../lib/agenticReviewMapping';
import { mergeSpecFieldSelection } from '../agenticReviewSpecFields';

describe('mapReviewAnswersToInput', () => {
  // TODO(agentic-review-flow-tests): Keep review-flow coverage aligned with ItemDetail checklist gating semantics.
  // TODO(agentic-review-semantics): Re-check mapping if checklist wording changes again.
  it('maps explicit german checklist intent to existing review payload fields', () => {
    const payload = mapReviewAnswersToInput(
      {
        descriptionMatches: true,
        shortTextMatches: false,
        hasUnnecessarySpecs: true,
        hasMissingSpecs: true,
        dimensionsPlausible: false
      },
      {
        missingSpecRaw: ' Spannung, material,Spannung , ',
        unneededSpecRaw: 'intern, Intern,  ',
        notes: '  please review  ',
        reviewPrice: 12.5,
        shopArticle: true
      }
    );

    expect(payload).toEqual({
      information_present: false,
      bad_format: true,
      wrong_information: false,
      wrong_physical_dimensions: true,
      missing_spec: ['Spannung', 'material'],
      unneeded_spec: ['intern'],
      notes: 'please review',
      review_price: 12.5,
      shop_article: true,
      reviewedBy: null
    });
  });



  it('maps selected spec fields into unneeded_spec and missing_spec payload arrays', () => {
    const payload = mapReviewAnswersToInput(
      {
        descriptionMatches: true,
        shortTextMatches: true,
        hasUnnecessarySpecs: true,
        hasMissingSpecs: true,
        dimensionsPlausible: true
      },
      {
        missingSpecRaw: mergeSpecFieldSelection(['Spannung', 'Leistung'], ' Schutzklasse , '),
        unneededSpecRaw: mergeSpecFieldSelection(['Marketing'], ' intern ,'),
        notes: '',
        reviewPrice: null,
        shopArticle: null
      }
    );

    expect(payload.unneeded_spec).toEqual(['Marketing', 'intern']);
    expect(payload.missing_spec).toEqual(['Spannung', 'Leistung', 'Schutzklasse']);
  });


  it('keeps review flow positive when only unnecessary specs are selected and a review price is set', () => {
    const payload = mapReviewAnswersToInput(
      {
        descriptionMatches: true,
        shortTextMatches: true,
        hasUnnecessarySpecs: true,
        hasMissingSpecs: false,
        dimensionsPlausible: true
      },
      {
        missingSpecRaw: '',
        unneededSpecRaw: mergeSpecFieldSelection(['Marketing'], ' interne Notiz '),
        notes: '',
        reviewPrice: 129.95,
        shopArticle: true
      }
    );

    expect(payload.information_present).toBe(true);
    expect(payload.bad_format).toBe(false);
    expect(payload.wrong_information).toBe(false);
    expect(payload.wrong_physical_dimensions).toBe(false);
    expect(payload.unneeded_spec).toEqual(['Marketing', 'interne Notiz']);
    expect(payload.review_price).toBe(129.95);
    expect(payload.shop_article).toBe(true);
  });


  it('uses explicit wrong-information flag when provided by checklist UI', () => {
    const payload = mapReviewAnswersToInput(
      {
        descriptionMatches: true,
        shortTextMatches: true,
        hasUnnecessarySpecs: false,
        hasMissingSpecs: false,
        dimensionsPlausible: true
      },
      {
        missingSpecRaw: '',
        unneededSpecRaw: '',
        wrongInformation: true
      }
    );

    expect(payload.wrong_information).toBe(true);
  });

  it('keeps positive checklist answers non-blocking and trims free text safely', () => {
    const payload = mapReviewAnswersToInput(
      {
        descriptionMatches: true,
        shortTextMatches: true,
        hasUnnecessarySpecs: false,
        hasMissingSpecs: false,
        dimensionsPlausible: true
      },
      {
        missingSpecRaw: '',
        unneededSpecRaw: '',
        notes: '  ',
        reviewPrice: null,
        shopArticle: null
      }
    );

    expect(payload).toEqual({
      information_present: true,
      bad_format: false,
      wrong_information: false,
      wrong_physical_dimensions: false,
      missing_spec: [],
      unneeded_spec: [],
      notes: null,
      review_price: null,
      shop_article: null,
      reviewedBy: null
    });
  });
});
