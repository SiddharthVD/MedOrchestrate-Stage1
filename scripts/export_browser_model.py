"""Export the actual local fine-tuned retriever for CPU browser inference.

No benchmark text or qrels are included. Requires the optional training environment
plus onnx==1.19.1 and onnxruntime==1.23.2. Run from the repository root.
"""
from pathlib import Path
import hashlib
import json
import shutil
import tempfile

import numpy as np
import onnx
import onnxruntime as ort
from onnxruntime.quantization import QuantType, quantize_dynamic
import torch
from transformers import AutoModel, AutoTokenizer
from medorchestrate.train_retriever import _model_files_hash

ROOT = Path(__file__).resolve().parents[1]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class Encoder(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids, attention_mask, token_type_ids):
        hidden = self.model(input_ids=input_ids, attention_mask=attention_mask,
                            token_type_ids=token_type_ids, return_dict=False)[0]
        mask = attention_mask.unsqueeze(-1).to(hidden.dtype)
        pooled = (hidden * mask).sum(1) / mask.sum(1).clamp(min=1e-9)
        return torch.nn.functional.normalize(pooled, p=2, dim=1)


def main():
    torch.set_num_threads(4)
    source = ROOT / "models/nfcorpus-minilm-v1"
    target = ROOT / "site/model"
    target.mkdir(parents=True, exist_ok=True)
    work = ROOT / "work/browser-export"
    work.mkdir(parents=True, exist_ok=True)
    export_temp = work / "tmp"
    export_temp.mkdir(exist_ok=True)
    tempfile.tempdir = str(export_temp)
    training = json.loads((source / "training_manifest.json").read_text())
    if _model_files_hash(source) != training["weights_sha256"]:
        raise ValueError("Saved trained weights do not match the frozen training manifest")
    tokenizer = AutoTokenizer.from_pretrained(source, local_files_only=True)
    encoder = Encoder(AutoModel.from_pretrained(source, local_files_only=True,
                                                attn_implementation="eager")).eval()
    texts = ["kidney disease and treatment evidence", "physical activity and mental health",
             "Do vaccines reduce infection?", "Diabetes mellitus: a systematic review.",
             "Café, naïve, β-cells and glucose ≥ 5 mmol/L.", "中文研究 and α-synuclein"]
    inputs = tokenizer(texts, padding=True, truncation=True, max_length=128, return_tensors="pt")
    with torch.no_grad():
        expected = encoder(**inputs).numpy()
        float_path = work / "model.onnx"
        torch.onnx.export(encoder, tuple(inputs[name] for name in
                          ("input_ids", "attention_mask", "token_type_ids")), float_path,
                          input_names=["input_ids", "attention_mask", "token_type_ids"],
                          output_names=["embeddings"], opset_version=17, dynamo=False,
                          dynamic_axes={name: {0: "batch", 1: "sequence"} for name in
                                        ("input_ids", "attention_mask", "token_type_ids")}
                                       | {"embeddings": {0: "batch"}})
    onnx.checker.check_model(str(float_path))
    quant_path = target / "model_quantized.onnx"
    quantize_dynamic(str(float_path), str(quant_path), weight_type=QuantType.QUInt8,
                     per_channel=True, op_types_to_quantize=["MatMul", "Gemm"])
    onnx.checker.check_model(str(quant_path))
    session = ort.InferenceSession(str(quant_path), providers=["CPUExecutionProvider"])
    actual = session.run(None, {name: value.numpy() for name, value in inputs.items()})[0]
    cosines = (actual * expected).sum(axis=1)
    if float(cosines.min()) < 0.98:
        raise ValueError(f"Quantized export parity below threshold: {cosines}")
    shutil.copyfile(source / "vocab.txt", target / "vocab.txt")
    manifest = {
        "version": "nfcorpus-minilm-v1-int8-onnx-1", "name": "MedOrchestrate trained MiniLM",
        "base_model": training["base_model"], "base_revision": training["base_revision"],
        "base_license": "Apache-2.0", "purpose": "Academic literature retrieval research",
        "trained_pair_count": training["trained_pair_count"], "training_dataset": "NFCorpus train",
        "weights_sha256": training["weights_sha256"],
        "weights_hash_definition": "SHA-256 of sorted relative filenames and each file hash, excluding training_manifest.json",
        "safetensors_sha256": sha(source / "model.safetensors"), "file": "model_quantized.onnx",
        "sha256": sha(quant_path), "size_bytes": quant_path.stat().st_size,
        "vocab_sha256": sha(target / "vocab.txt"), "max_length": 128, "dimensions": 384,
        "pooling": "attention-masked mean followed by L2 normalization",
        "quantization": "dynamic uint8 per-channel MatMul/Gemm weights; embeddings remain float", "opset": 17,
        "export_packages": {"torch": torch.__version__, "onnx": onnx.__version__, "onnxruntime": ort.__version__},
        "parity": {"sample_count": len(texts), "min_cosine_to_trained_float": float(cosines.min()),
                   "mean_cosine_to_trained_float": float(cosines.mean())},
        "limitation": "Nutrition-trained research model; broader medical quality has not been independently evaluated. Quantized export is not the exact float benchmark model. No clinical validation.",
    }
    (target / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    vectors = [{"text": text, "input_ids": inputs["input_ids"][i].tolist(),
                "attention_mask": inputs["attention_mask"][i].tolist(),
                "embedding": actual[i].tolist()} for i, text in enumerate(texts)]
    (target / "parity-fixtures.json").write_text(json.dumps(vectors, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
