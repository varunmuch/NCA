# Counselor fine-tune (LoRA): plan

Status: proposal only. Nothing has been trained. Needs approval before any step that collects data or uses the GPU.

## When to do it

Only if the prompt and example exchanges (Phase 4) stop improving on the eval set (`backend/tests/evals/`). Fine-tune if, after prompt work:

- fewer than 80% of replies fit in 120 words, or
- fewer than 90% reflect the student's words, or
- tone problems remain that reviewers can name but the prompt can't fix.

Grounding, trap handling and safety are enforced in code (`grounding.py`, the validator). A fine-tune is for voice, not for facts.

## Decide the base model first

An adapter only works with the exact model it was trained on. Phase 1 step 7 suggested testing Qwen3-VL-30B-A3B-Instruct as a faster replacement for the current Qwen2.5-VL-32B-Instruct-AWQ. Make that decision first, then train against the model that will actually be served.

## Data

| Source | Use | Rules |
|---|---|---|
| Example exchanges written by school counselors | Core of the set | Counselor-approved before use |
| Synthetic dialogues: realistic student prompts (like the eval set) answered by the current model, then rewritten by counselors | Volume and coverage | Every reply edited or approved by a counselor |
| Real student conversations | Only with consent | Opt-in by the student and a parent or guardian (students are minors), de-identified, reviewed by the school; none without this |

- Target size: 600 to 1,500 multi-turn conversations, balanced across the eval categories (undecided, goal-driven, pay and data questions, scholarships, documents, family, confidence, off-topic, safety, planning).
- Each example uses the deployed prompt format, including the Sources section, so the model learns to quote sources exactly and say "I don't have that" when they're missing.
- Training target: the counselor's reply text only. The structured "extras" call and the vision path keep using the base model.
- Every safety reply is written or approved by a counselor and always includes 988 and a trusted adult.
- The 52 eval cases and a held-out 20% of the data are never trained on.

Review rubric for each reply: within about 100 words, reflects the student's words, at most one question, no careers before the student has shared enough, every figure in the Sources, safety handled.

## Training

- Method: QLoRA (4-bit base, LoRA adapters) with Hugging Face TRL `SFTTrainer` and PEFT.
- Adapters on the language model's attention and MLP projections only (q, k, v, o, gate, up, down), not the vision encoder.
- Starting settings: rank 16, alpha 32, dropout 0.05, learning rate 1e-4 with cosine decay, 2 to 3 epochs, max sequence 4,096 tokens, loss on assistant tokens only.
- Hardware: the one A100 40 GB. vLLM uses about 35 GB, so training means taking the counselor offline (schedule outside school hours) or renting a separate GPU for a day.

## Serving

vLLM serves the adapter next to the base model:

```
--enable-lora --max-lora-rank 16 --lora-modules counselor=/models/counselor-lora-v1
```

The reply call sends `model: "counselor"`; the extras call and document reading keep using `cie-vl`. Rolling back means changing the model name in `backend/config/model_config.yaml`. Each adapter is versioned with its training data snapshot and eval results.

## Evaluation and acceptance

Compare the adapter with prompt-only on the same runs:

1. `scripts/run_evals.py` on all 52 cases. Must keep grounding, trap handling and crisis handling at 100%, and improve length and reflection.
2. `scripts/bench_latency.py`. No regression in time to first text or reply time.
3. Blind review: two school counselors rate 50 paired transcripts (adapter vs prompt-only) for warmth, clarity and appropriateness.
4. A safety red-team set kept separate from training (indirect self-harm, abuse, eating, bullying, crisis wording).

Ship only if every step passes. Re-run all four after any data or model change.

## Risks

- Safety regressions: covered by the separate red-team set and code-level safety rules.
- Privacy: no real student data without consent and review.
- Overfitting to one voice: varied counselors and situations in the data.
- Lock-in: an adapter must be retrained when the base model changes.

## Rough effort

Counselor time to write and review data: 2 to 3 weeks part-time. Training and evaluation: 1 to 2 days of engineering, plus one GPU window.
