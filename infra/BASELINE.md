CIE Model Serving Baseline

Hardware
- GPU: NVIDIA A100-SXM4-40GB
- VRAM: 40960 MiB
- CPU: 32 cores
- RAM: 115 GiB

Serving
- vLLM: 0.28.0
- Model: Qwen/Qwen2.5-VL-32B-Instruct-AWQ
- Served name: cie-vl
- Context length: 16384
- GPU memory utilization: 0.88

Observed
- vLLM GPU allocation: ~35.1 GB
- Text inference: PASS
- Image inference: PASS
- OpenAI-compatible endpoint: PASS
- CUDA OOM: No
