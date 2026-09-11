#!/bin/bash

docker run --rm \
  --gpus all \
  --ipc=host \
  -p 8000:8000 \
  -v "$HOME/.cache/huggingface:/root/.cache/huggingface" \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen2.5-VL-32B-Instruct-AWQ \
  --served-model-name cie-vl \
  --quantization awq \
  --dtype auto \
  --max-model-len 16384 \
  --gpu-memory-utilization 0.88 \
  --trust-remote-code
