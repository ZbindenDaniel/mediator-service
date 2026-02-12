import { mapReviewAnswersToInput } from '../../lib/agenticReviewMapping';

describe('mapReviewAnswersToInput', () => {
  it('maps updated review question semantics to existing review payload fields', () => {
    const payload = mapReviewAnswersToInput(
      {
        plausible: false,
        formattingCorrect: true,
        missingExpectedInfo: true,
        requiredDimensionsMissing: true
      },
      {
        missingSpecRaw: ' Spannung, material,Spannung , ',
        notes: '  please review  '
      }
    );

    expect(payload).toEqual({
      information_present: false,
      bad_format: false,
      wrong_information: true,
      wrong_physical_dimensions: true,
      missing_spec: ['Spannung', 'material'],
      notes: 'please review',
      reviewedBy: null
    });
  });

  it('maps positive answers and empty free text safely', () => {
    const payload = mapReviewAnswersToInput(
      {
        plausible: true,
        formattingCorrect: true,
        missingExpectedInfo: false,
        requiredDimensionsMissing: false
      },
      {
        missingSpecRaw: '',
        notes: '  '
      }
    );

    expect(payload).toEqual({
      information_present: true,
      bad_format: false,
      wrong_information: false,
      wrong_physical_dimensions: false,
      missing_spec: [],
      notes: null,
      reviewedBy: null
    });
  });
});
