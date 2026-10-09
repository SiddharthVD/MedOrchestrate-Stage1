"""Publish a small source-checked assertion pilot, never co-occurrence claims."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
# Passages below were checked against the locally licensed source abstracts.
SPECS = [
 ('MED:42796100','Chronic kidney disease','disease',"Ménière\u0027s disease",'disease','NO_INCREASE_DETECTED','The available point estimates did not indicate a higher hazard of incident MD among participants with CKD','Korean national cohort; 15,943 CKD participants and 63,772 matched comparisons','Longitudinal observational cohort','Weighted variance estimation unavailable; death not modeled as competing event.'),
 ('MED:42551975','Maternal asthma','disease','Childhood asthma','disease','REPORTED_ASSOCIATION','Maternal asthma was associated with increased odds of all offspring asthma phenotypes','16,055 children in the Norwegian MoBa cohort','Observational cohort','Parent-reported asthma; association does not establish causation.'),
 ('MED:42798062','Zinc deficiency','biomedical concept','Hypertension','disease','REPORTED_ASSOCIATION','Zinc deficiency was associated with incident hypertension and related complications, particularly secondary hypertension.','Adults with zinc measurements; 47,843 matched pairs','Retrospective cohort','Prospective studies needed to determine whether correcting deficiency modifies risk.'),
 ('MED:42741302','Anxiety and depressive symptoms','symptom','Stage 2 hypertension','disease','REPORTED_ASSOCIATION','both scores ≥1 were associated with a higher risk of stage 2 hypertension','2,448 Taiwanese military personnel free of hypertension at baseline','Observational cohort','Self-reported symptoms; population-specific, nonlinear associations; no causality established.'),
 ('MED:42819614','Central obesity','disease','Asthma attacks','symptom','NO_ASSOCIATION_DETECTED','Central obesity was not independently linked to asthma attacks','908 US adults with active asthma in NHANES 2021–2023','Cross-sectional study','Adjusted confidence interval includes no association; not proof of absence in other populations.'),
 ('MED:42281713','GLP-1 receptor agonists','intervention','Lower blood pressure','outcome','DESCRIPTIVE_DIFFERENCE','Lower blood pressure levels were observed among GLP-1 receptor agonist users compared with nonusers in this population.','Nondiabetic adults with obesity; only TWO exposed participants','Cross-sectional descriptive analysis','Extremely small exposed sample (n=2); authors explicitly disclaim causal inference.'),
 ('MED:42109572','GLP-1 receptor agonists','intervention','Kidney disease progression','outcome','REPORTED_LOWER_RISK','GLP-1 receptor agonist initiation was associated with a lower risk of kidney disease progression compared with DPP-4 inhibitor or sulfonylurea initiation','UK adults with type 2 diabetes already receiving SGLT2 inhibitors','Observational target-trial emulation','Active-comparator observational study; HR 0.73 (95% CI 0.58–0.92); prospective confirmation needed.'),
 ('MED:42819381','Pulmonary rehabilitation','intervention','Dyspnea','symptom','REPORTED_PRE_POST_IMPROVEMENT','The outpatient PRP was associated with significant improvements in exercise capacity, fatigue, dyspnea, and functional status.','54 symptomatic patients after COVID-19 hospitalization','Single-arm non-randomized prospective trial','Uncontrolled before/after comparison; does not establish a treatment effect versus usual care.'),
 ('MED:42405354','Tirzepatide','intervention','Exercise-induced anaphylaxis','symptom','CASE_REPORT_TEMPORAL_ASSOCIATION','We report a patient who developed exercise-induced anaphylaxis after starting the dual glucose-dependent insulinotropic polypeptide/glucagon-like peptide-1 receptor agonist tirzepatide','One reported patient','Case report','Temporal association in one case; incidence and causation cannot be inferred.'),
]

def main():
    corpus=json.loads((ROOT/'site/data/research-corpus.json').read_text(encoding='utf8'))
    documents={doc['id']:doc for doc in corpus['documents']}
    rows=[]
    for i,(study,subject,subject_type,obj,obj_type,predicate,passage,population,design,limitations) in enumerate(SPECS):
        doc=documents[study]
        if passage not in doc['abstract']: raise ValueError(f'Passage mismatch: {study}')
        def concept(label,kind):
            import re
            return {'id':'assertion-term:'+re.sub(r'[^a-z0-9]+','-',label.lower()).strip('-'),'label':label,'type':kind,'normalization':'local source label; not a canonical ontology identifier'}
        rows.append({'id':f'assertion-{i+1:03}','study_id':study,'subject':concept(subject,subject_type),'object':concept(obj,obj_type),'predicate':predicate,'evidence':passage,'evidence_location':'source abstract','population':population,'study_design':design,'limitations':limitations,'source_url':doc['source_url'],'fulltext_url':doc['fulltext_url'],'pdf_url':doc['pdf_url'],'publication_date':doc['published_on'],'license':doc['license'],'retrieved_at':doc['retrieved_at'],'review_status':'Passage checked against source metadata; NOT independently medically reviewed','method':'Manual source-grounded curation; no inferred clinical fact'})
    payload={'version':'source-assertions-v1','corpus_version':corpus['version'],'corpus_updated_at':corpus['updated_at'],'coverage':'Small curated pilot of nine assertions from nine studies; not a comprehensive biomedical fact base','assertions':rows}
    (ROOT/'site/data/relationships.json').write_text(json.dumps(payload,ensure_ascii=True,indent=2)+'\n',encoding='utf8')
    print(f'Validated {len(rows)} exact evidence passages and written source assertions')

if __name__=='__main__': main()
