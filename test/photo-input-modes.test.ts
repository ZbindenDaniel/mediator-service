const {
  PHOTO_INPUT_FIELDS,
  getNextPhotoInputMode,
  initializePhotoInputModes,
  resolvePhotoCaptureAttribute
} = require('../frontend/src/components/forms/itemFormShared');

describe('photo input mode helpers', () => {
  test('initializes camera mode by default for all fields', () => {
    const modes = initializePhotoInputModes();

    for (const field of PHOTO_INPUT_FIELDS) {
      expect(modes[field]).toBe('camera');
    }
  });

  test('merges provided initial modes for specific fields', () => {
    const modes = initializePhotoInputModes({ picture2: 'file' });

    expect(modes.picture1).toBe('camera');
    expect(modes.picture2).toBe('file');
    expect(modes.picture3).toBe('camera');
  });

  test('toggles between camera and file modes deterministically', () => {
    expect(getNextPhotoInputMode('camera')).toBe('file');
    expect(getNextPhotoInputMode('file')).toBe('camera');
  });

  test('resolves capture attribute only when camera mode is active', () => {
    expect(resolvePhotoCaptureAttribute('camera')).toBe('environment');
    expect(resolvePhotoCaptureAttribute('file')).toBeUndefined();
  });
});
