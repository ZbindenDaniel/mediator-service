// TODO: Revisit dialog service resilience for multi-root scenarios when architecture evolves.
import {
  BaseDialogOptions,
  ConfirmDialogOptions,
  DialogContextValue,
  PromptDialogOptions
} from './DialogProvider';

interface DialogImplementation extends DialogContextValue {}

class DialogService {
  private implementation?: DialogImplementation;

  register(implementation: DialogImplementation) {
    try {
      this.implementation = implementation;
    } catch (error) {
      console.error('Failed to store dialog service implementation', error);
    }
  }

  unregister(implementation: DialogImplementation) {
    if (this.implementation === implementation) {
      this.implementation = undefined;
    }
  }

  private getImplementation(method: keyof DialogImplementation) {
    if (!this.implementation) {
      const error = new Error('Dialog service not initialized');
      console.error('Missing dialog service implementation for', method, error);
      throw error;
    }
    return this.implementation;
  }

  alert(options: BaseDialogOptions) {
    try {
      return this.getImplementation('alert').alert(options);
    } catch (error) {
      console.error('Dialog service alert failed', error);
      return Promise.reject(error);
    }
  }

  confirm(options: ConfirmDialogOptions) {
    try {
      return this.getImplementation('confirm').confirm(options);
    } catch (error) {
      console.error('Dialog service confirm failed', error);
      return Promise.reject(error);
    }
  }

  prompt(options: PromptDialogOptions) {
    try {
      return this.getImplementation('prompt').prompt(options);
    } catch (error) {
      console.error('Dialog service prompt failed', error);
      return Promise.reject(error);
    }
  }
}

export const dialogService = new DialogService();
