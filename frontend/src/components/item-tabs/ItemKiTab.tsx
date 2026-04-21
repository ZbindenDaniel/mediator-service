import React from 'react';
import { AgenticStatusCard, type AgenticStatusCardProps } from '../AgenticStatusCard';
import AgenticSpecFieldReviewModal, {
  type AgenticSpecFieldOption,
  type AgenticSpecFieldReviewResult
} from '../AgenticSpecFieldReviewModal';

export interface SpecFieldModalState {
  title: string;
  description: string;
  fieldOptions: AgenticSpecFieldOption[];
  includeAdditionalInput: boolean;
  additionalInputPlaceholder?: string;
  secondaryTitle?: string;
  secondaryDescription?: string;
  secondaryFieldOptions?: AgenticSpecFieldOption[];
  includeSecondaryAdditionalInput?: boolean;
  secondaryAdditionalInputPlaceholder?: string;
}

interface Props {
  agenticCardProps: AgenticStatusCardProps;
  specFieldModalState: SpecFieldModalState | null;
  onSpecFieldModalClose: () => void;
  onSpecFieldModalConfirm: (result: AgenticSpecFieldReviewResult) => void;
}

export default function ItemKiTab({
  agenticCardProps,
  specFieldModalState,
  onSpecFieldModalClose,
  onSpecFieldModalConfirm
}: Props) {
  return (
    <>
      <AgenticStatusCard {...agenticCardProps} initiallyExpanded />
      {specFieldModalState ? (
        <AgenticSpecFieldReviewModal
          title={specFieldModalState.title}
          description={specFieldModalState.description}
          fieldOptions={specFieldModalState.fieldOptions}
          includeAdditionalInput={specFieldModalState.includeAdditionalInput}
          additionalInputPlaceholder={specFieldModalState.additionalInputPlaceholder}
          secondaryTitle={specFieldModalState.secondaryTitle}
          secondaryDescription={specFieldModalState.secondaryDescription}
          secondaryFieldOptions={specFieldModalState.secondaryFieldOptions}
          includeSecondaryAdditionalInput={specFieldModalState.includeSecondaryAdditionalInput}
          secondaryAdditionalInputPlaceholder={specFieldModalState.secondaryAdditionalInputPlaceholder}
          onCancel={onSpecFieldModalClose}
          onConfirm={onSpecFieldModalConfirm}
        />
      ) : null}
    </>
  );
}
