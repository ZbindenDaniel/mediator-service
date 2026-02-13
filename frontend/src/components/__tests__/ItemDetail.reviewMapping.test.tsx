import { mapReviewAnswersToInput } from '../../lib/agenticReviewMapping';
import { mergeSpecFieldSelection } from '../agenticReviewSpecFields';

describe('mapReviewAnswersToInput', () => {
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
        notes: '  please review  '
      }
    );

    expect(payload).toEqual({
      information_present: false,
      bad_format: true,
      wrong_information: true,
      wrong_physical_dimensions: true,
      missing_spec: ['Spannung', 'material'],
      unneeded_spec: ['intern'],
      notes: 'please review',
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
        notes: ''
      }
    );

    expect(payload.unneeded_spec).toEqual(['Marketing', 'intern']);
    expect(payload.missing_spec).toEqual(['Spannung', 'Leistung', 'Schutzklasse']);
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
        notes: '  '
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
      reviewedBy: null
    });
  });
});
