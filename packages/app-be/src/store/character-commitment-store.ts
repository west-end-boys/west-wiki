import type {
  CharacterCommitment,
  CharacterId,
  CommitmentId,
} from "../index.js";

export interface CreateCharacterCommitmentInput
  extends Omit<CharacterCommitment, "id"> {}

export interface CharacterCommitmentStore {
  createCommitment(
    input: CreateCharacterCommitmentInput,
  ): Promise<CharacterCommitment>;

  getCommitment(
    commitmentId: CommitmentId,
  ): Promise<CharacterCommitment | null>;

  listCommitmentsForCharacter(
    characterId: CharacterId,
  ): Promise<CharacterCommitment[]>;

  updateCommitment(
    commitment: CharacterCommitment,
  ): Promise<CharacterCommitment>;
}
