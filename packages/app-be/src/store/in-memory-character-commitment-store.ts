import type {
  CharacterCommitment,
  CharacterId,
  CommitmentId,
} from "../index.js";
import type {
  CharacterCommitmentStore,
  CreateCharacterCommitmentInput,
} from "./character-commitment-store.js";

export interface InMemoryCharacterCommitmentStoreSeed {
  commitments?: CharacterCommitment[];
}

export class InMemoryCharacterCommitmentStore
  implements CharacterCommitmentStore
{
  private readonly commitments = new Map<CommitmentId, CharacterCommitment>();
  private sequence = 0;

  constructor(seed: InMemoryCharacterCommitmentStoreSeed = {}) {
    for (const commitment of seed.commitments ?? []) {
      this.commitments.set(commitment.id, structuredClone(commitment));
    }
  }

  async createCommitment(
    input: CreateCharacterCommitmentInput,
  ): Promise<CharacterCommitment> {
    const commitment: CharacterCommitment = {
      id: `commitment-${++this.sequence}`,
      ...structuredClone(input),
    };
    this.commitments.set(commitment.id, commitment);
    return structuredClone(commitment);
  }

  async getCommitment(
    commitmentId: CommitmentId,
  ): Promise<CharacterCommitment | null> {
    const commitment = this.commitments.get(commitmentId);
    return commitment ? structuredClone(commitment) : null;
  }

  async listCommitmentsForCharacter(
    characterId: CharacterId,
  ): Promise<CharacterCommitment[]> {
    return [...this.commitments.values()]
      .filter((commitment) => commitment.characterId === characterId)
      .map((commitment) => structuredClone(commitment));
  }

  async updateCommitment(
    commitment: CharacterCommitment,
  ): Promise<CharacterCommitment> {
    if (!this.commitments.has(commitment.id)) {
      throw new Error(`Unknown commitment ${commitment.id}`);
    }
    this.commitments.set(commitment.id, structuredClone(commitment));
    return structuredClone(commitment);
  }
}
